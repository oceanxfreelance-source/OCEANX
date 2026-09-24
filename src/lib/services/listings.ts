import { Prisma, type ItemCondition, type ListingStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { sha256 } from "../crypto";
import { UserError, NotFoundError, ForbiddenError } from "../errors";
import { getSettings } from "../settings";
import { mvrToLaari } from "../money";
import { optionalPhone, textField, cleanText } from "../validation";
import { startOfMvDay } from "../dates";
import { notify } from "../notify";
import { audit } from "../audit";
import { quotePostingFee } from "./fees";
import { recomputeSellerStats } from "./reputation";
import { evaluateReferral } from "./referrals";

export const CONDITIONS: { value: ItemCondition; label: string }[] = [
  { value: "NEW", label: "Brand new" },
  { value: "LIKE_NEW", label: "Like new" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "FOR_PARTS", label: "For parts / not working" },
  { value: "NOT_APPLICABLE", label: "Not applicable" },
];

export const EDITABLE_STATUSES: ListingStatus[] = ["DRAFT", "PENDING_PAYMENT", "REJECTED"];
const ACTIVE_STATUSES: ListingStatus[] = ["DRAFT", "PENDING_PAYMENT", "PAYMENT_REVIEW", "PUBLISHED", "REJECTED"];

export const listingInputSchema = z.object({
  title: textField(5, 100, "Title"),
  description: textField(10, 5000, "Description"),
  price: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const n = Number(v.replace(/[, ]/g, ""));
      if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid price in MVR." });
        return z.NEVER;
      }
      return mvrToLaari(n);
    }),
  negotiable: z.boolean(),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS", "NOT_APPLICABLE"]),
  categoryId: z.string().min(1, "Choose a category."),
  subcategoryId: z.string().optional().nullable().transform((v) => v || null),
  atollId: z.string().min(1, "Choose an atoll."),
  islandId: z.string().min(1, "Choose an island."),
  locationId: z.string().optional().nullable().transform((v) => v || null),
  locationDetail: z.string().max(120).optional().nullable().transform((v) => (v ? cleanText(v, 120) : null)),
  contactPhone: optionalPhone,
  contactWhatsapp: optionalPhone,
  contactEmail: z.string().trim().toLowerCase().email("Enter a valid contact email.").optional().or(z.literal("")).transform((v) => v || null),
  showPhone: z.boolean(),
  businessId: z.string().optional().nullable().transform((v) => v || null),
  imageIds: z.array(z.string()).min(1, "Add at least one photo."),
});

export type ListingInput = z.input<typeof listingInputSchema>;

function normalise(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function listingContentHash(d: { title: string; description: string; price: number; categoryId: string }) {
  return sha256(`${normalise(d.title)}|${normalise(d.description)}|${d.price}|${d.categoryId}`);
}

export async function assertCanSell(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ForbiddenError();
  if (user.status !== "ACTIVE") throw new ForbiddenError("Your account is not active.");
  if (!user.emailVerifiedAt) throw new UserError("Please verify your email before selling.", "EMAIL_UNVERIFIED");
  return user;
}

async function validateRelations(userId: string, d: z.output<typeof listingInputSchema>) {
  const settings = await getSettings();
  const [category, sub, island, location] = await Promise.all([
    prisma.category.findUnique({ where: { id: d.categoryId } }),
    d.subcategoryId ? prisma.subcategory.findUnique({ where: { id: d.subcategoryId } }) : null,
    prisma.island.findUnique({ where: { id: d.islandId }, include: { atoll: true } }),
    d.locationId ? prisma.location.findUnique({ where: { id: d.locationId } }) : null,
  ]);
  if (!category || !category.isActive) throw new UserError("Choose a valid category.");
  if (d.subcategoryId && (!sub || sub.categoryId !== category.id || !sub.isActive)) throw new UserError("Choose a valid subcategory.");
  if (!island || island.atollId !== d.atollId || !island.isActive || !island.atoll.isActive) throw new UserError("Choose a valid island for the selected atoll.");
  if (d.locationId && (!location || location.islandId !== island.id || !location.isActive)) throw new UserError("Choose a valid location for the selected island.");
  if (!d.contactPhone && !d.contactWhatsapp && !d.contactEmail) {
    // Buyers can always use in-app messaging; phone is optional.
  }
  if (d.imageIds.length > settings.general.maxImagesPerListing) throw new UserError(`You can add up to ${settings.general.maxImagesPerListing} photos.`);
  const files = await prisma.storedFile.findMany({ where: { id: { in: d.imageIds }, ownerId: userId, purpose: "listing_image" }, select: { id: true } });
  if (files.length !== new Set(d.imageIds).size) throw new UserError("One or more photos could not be found. Please upload them again.");
  if (d.businessId) {
    const biz = await prisma.business.findUnique({ where: { id: d.businessId } });
    if (!biz || biz.ownerId !== userId || biz.status !== "ACTIVE") throw new UserError("Choose a valid business.");
  }
}

async function assertNotDuplicate(userId: string, hash: string, title: string, categoryId: string, excludeId?: string) {
  const dup = await prisma.listing.findFirst({
    where: {
      sellerId: userId,
      status: { in: ACTIVE_STATUSES },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      OR: [{ contentHash: hash }, { categoryId, title: { equals: title, mode: "insensitive" } }],
    },
    select: { id: true },
  });
  if (dup) throw new UserError("You already have an active listing for this item. Edit the existing listing instead of posting a duplicate.", "DUPLICATE");
}

export async function createListingDraft(userId: string, input: ListingInput) {
  await assertCanSell(userId);
  const d = listingInputSchema.parse(input);
  const settings = await getSettings();
  const [today, active] = await Promise.all([
    prisma.listing.count({ where: { sellerId: userId, createdAt: { gte: startOfMvDay() } } }),
    prisma.listing.count({ where: { sellerId: userId, status: { in: ACTIVE_STATUSES } } }),
  ]);
  if (today >= settings.general.maxListingsCreatedPerDay) throw new UserError("You have reached today's limit for new listings. Please try again tomorrow.", "RATE_LIMITED");
  if (active >= settings.general.maxActiveListingsPerUser) throw new UserError("You have reached the maximum number of active listings.");
  await validateRelations(userId, d);
  const hash = listingContentHash(d);
  await assertNotDuplicate(userId, hash, d.title, d.categoryId);

  const { imageIds, ...fields } = d;
  return prisma.listing.create({
    data: {
      ...fields,
      sellerId: userId,
      contentHash: hash,
      status: "DRAFT",
      images: { create: imageIds.map((fileId, i) => ({ fileId, sortOrder: i })) },
    },
  });
}

export async function updateListingDraft(listingId: string, userId: string, input: ListingInput) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new NotFoundError();
  if (listing.sellerId !== userId) throw new ForbiddenError();
  if (!EDITABLE_STATUSES.includes(listing.status)) throw new UserError("This listing can no longer be fully edited.");
  const d = listingInputSchema.parse(input);
  await validateRelations(userId, d);
  const hash = listingContentHash(d);
  await assertNotDuplicate(userId, hash, d.title, d.categoryId, listingId);
  const { imageIds, ...fields } = d;
  return prisma.$transaction(async (tx) => {
    await tx.listingImage.deleteMany({ where: { listingId } });
    return tx.listing.update({
      where: { id: listingId },
      data: { ...fields, contentHash: hash, images: { create: imageIds.map((fileId, i) => ({ fileId, sortOrder: i })) } },
    });
  });
}

export const publishedEditSchema = z.object({
  description: textField(10, 5000, "Description"),
  price: listingInputSchema.shape.price,
  negotiable: z.boolean(),
  locationDetail: listingInputSchema.shape.locationDetail,
  contactPhone: optionalPhone,
  contactWhatsapp: optionalPhone,
  contactEmail: listingInputSchema.shape.contactEmail,
  showPhone: z.boolean(),
});

/** Published listings may update details but not their title/category (prevents re-using a paid slot for another item). */
export async function updatePublishedListing(listingId: string, userId: string, input: z.input<typeof publishedEditSchema>) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new NotFoundError();
  if (listing.sellerId !== userId) throw new ForbiddenError();
  if (listing.status !== "PUBLISHED" && listing.status !== "PAYMENT_REVIEW") throw new UserError("Only live listings can be edited here.");
  const d = publishedEditSchema.parse(input);
  return prisma.listing.update({
    where: { id: listingId },
    data: { ...d, contentHash: listingContentHash({ title: listing.title, description: d.description, price: d.price, categoryId: listing.categoryId }) },
  });
}

/** Moves a draft to the payment step (or publishes immediately when the fee is zero). */
export async function submitListing(listingId: string, userId: string) {
  await assertCanSell(userId);
  const settings = await getSettings();
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, include: { images: true } });
  if (!listing) throw new NotFoundError();
  if (listing.sellerId !== userId) throw new ForbiddenError();
  if (!["DRAFT", "REJECTED", "PENDING_PAYMENT"].includes(listing.status)) throw new UserError("This listing has already been submitted.");
  if (listing.images.length === 0) throw new UserError("Add at least one photo.");

  if (settings.cancellation.blockPostingWithUnpaidFines) {
    const unpaid = await prisma.cancellationFine.count({ where: { status: { in: ["UNPAID"] }, cancellation: { sellerId: userId } } });
    if (unpaid > 0) throw new UserError("Please settle your outstanding cancellation fee before publishing new listings.", "UNPAID_FINE");
  }

  const quote = await quotePostingFee(userId, { businessId: listing.businessId, settings, excludeListingId: listing.id });
  if (quote.amount === 0) {
    await prisma.listing.update({
      where: { id: listingId },
      data: { submittedAt: new Date(), feeAmount: 0, feeIsVipRate: false, feeWaivedReason: quote.waivedReason },
    });
    await publishListing(listingId, null);
    return { published: true, quote };
  }
  await prisma.listing.update({ where: { id: listingId }, data: { status: "PENDING_PAYMENT", submittedAt: new Date() } });
  return { published: false, quote };
}

/** Internal: called when the posting fee has been verified (or waived). */
export async function publishListing(listingId: string, actorId: string | null) {
  const listing = await prisma.listing.update({
    where: { id: listingId },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  await notify(listing.sellerId, {
    type: "listing",
    title: "Your listing is live",
    body: `"${listing.title}" is now published on MV Markets.`,
    link: `/listing/${listing.id}`,
    event: "listingPublished",
  });
  if (actorId) await audit({ actorId, action: "listing.publish", entityType: "Listing", entityId: listingId, summary: `Published "${listing.title}"` });
  await recomputeSellerStats(listing.sellerId);
  await evaluateReferral(listing.sellerId);
  return listing;
}

export async function deleteDraft(listingId: string, userId: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, include: { payments: true } });
  if (!listing) throw new NotFoundError();
  if (listing.sellerId !== userId) throw new ForbiddenError();
  if (listing.publishedAt || !["DRAFT", "PENDING_PAYMENT", "REJECTED"].includes(listing.status)) {
    throw new UserError("Only unpublished listings can be deleted. Published listings must be withdrawn.");
  }
  if (listing.payments.some((p) => ["AI_CHECKING", "PENDING", "NEEDS_REVIEW", "VERIFIED"].includes(p.status))) {
    throw new UserError("This listing has a payment under review and cannot be deleted.");
  }
  await prisma.listing.delete({ where: { id: listingId } });
}

export async function adminRemoveListing(listingId: string, adminId: string, reason: string) {
  if (!reason.trim()) throw new UserError("A reason is required.");
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new NotFoundError();
  if (listing.status === "REMOVED") throw new UserError("Listing is already removed.");
  await prisma.listing.update({ where: { id: listingId }, data: { status: "REMOVED", removedAt: new Date(), removedReason: reason } });
  await audit({ actorId: adminId, action: "listing.remove", entityType: "Listing", entityId: listingId, summary: `Removed "${listing.title}": ${reason}` });
  await notify(listing.sellerId, {
    type: "listing",
    title: "Listing removed by MV Markets",
    body: `"${listing.title}" was removed by our moderation team. Reason: ${reason}. No cancellation fee applies.`,
    link: "/account/listings",
  });
  await recomputeSellerStats(listing.sellerId);
}

export async function adminRestoreListing(listingId: string, adminId: string, reason: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "REMOVED") throw new UserError("Only removed listings can be restored.");
  const target: ListingStatus = listing.soldAt ? "SOLD" : listing.publishedAt ? "PUBLISHED" : "DRAFT";
  await prisma.listing.update({ where: { id: listingId }, data: { status: target, removedAt: null, removedReason: null } });
  await audit({ actorId: adminId, action: "listing.restore", entityType: "Listing", entityId: listingId, summary: `Restored "${listing.title}" to ${target}: ${reason}` });
  await recomputeSellerStats(listing.sellerId);
}

// ───────────── Search ─────────────

export const searchSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  category: z.string().optional().default(""),
  sub: z.string().optional().default(""),
  atoll: z.string().optional().default(""),
  island: z.string().optional().default(""),
  min: z.string().optional().default(""),
  max: z.string().optional().default(""),
  condition: z.string().optional().default(""),
  sort: z.enum(["newest", "oldest", "price_asc", "price_desc"]).catch("newest").default("newest"),
  sold: z.string().optional().default(""),
  vip: z.string().optional().default(""),
  page: z.coerce.number().int().min(1).max(500).catch(1).default(1),
});

export type SearchParams = z.infer<typeof searchSchema>;
export const PAGE_SIZE = 24;

export const listingCardSelect = {
  id: true,
  title: true,
  price: true,
  negotiable: true,
  condition: true,
  status: true,
  publishedAt: true,
  soldAt: true,
  featuredUntil: true,
  island: { select: { name: true } },
  atoll: { select: { code: true, name: true } },
  images: { select: { fileId: true }, orderBy: { sortOrder: "asc" as const }, take: 1 },
  seller: { select: { id: true, name: true, vipStatus: { select: { state: true, expiresAt: true } }, sellerStats: { select: { stars: true } } } },
  business: { select: { name: true, slug: true, verified: true } },
} satisfies Prisma.ListingSelect;

export async function searchListings(raw: Record<string, string | string[] | undefined>) {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") flat[k] = v;
  const p = searchSchema.parse(flat);
  const where: Prisma.ListingWhereInput = {
    status: p.sold === "1" ? { in: ["PUBLISHED", "SOLD"] } : "PUBLISHED",
    seller: { status: "ACTIVE" },
  };
  const and: Prisma.ListingWhereInput[] = [];
  if (p.q) {
    const words = p.q.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const w of words) and.push({ OR: [{ title: { contains: w, mode: "insensitive" } }, { description: { contains: w, mode: "insensitive" } }] });
  }
  if (p.category) where.category = { slug: p.category };
  if (p.sub) where.subcategory = { slug: p.sub };
  if (p.atoll) where.atollId = p.atoll;
  if (p.island) where.islandId = p.island;
  if (p.condition && CONDITIONS.some((c) => c.value === p.condition)) where.condition = p.condition as ItemCondition;
  const min = Number(p.min);
  const max = Number(p.max);
  if (p.min && Number.isFinite(min)) and.push({ price: { gte: mvrToLaari(min) } });
  if (p.max && Number.isFinite(max)) and.push({ price: { lte: mvrToLaari(max) } });
  if (p.vip === "1") and.push({ seller: { vipStatus: { state: "ACTIVE", expiresAt: { gt: new Date() } } } });
  if (and.length) where.AND = and;

  const orderBy: Prisma.ListingOrderByWithRelationInput[] =
    p.sort === "price_asc" ? [{ price: "asc" }] : p.sort === "price_desc" ? [{ price: "desc" }] : p.sort === "oldest" ? [{ publishedAt: "asc" }] : [{ publishedAt: "desc" }];

  const [total, items] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({ where, orderBy: [...orderBy, { id: "desc" }], skip: (p.page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: listingCardSelect }),
  ]);
  return { params: p, total, items, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type ListingCardData = Prisma.ListingGetPayload<{ select: typeof listingCardSelect }>;

export async function recordListingView(listingId: string) {
  await prisma.listing.update({ where: { id: listingId }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
}
