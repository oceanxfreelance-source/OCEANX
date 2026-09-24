import { z } from "zod";
import { prisma } from "../db";
import { UserError, NotFoundError, ForbiddenError } from "../errors";
import { getSettings } from "../settings";
import { optionalPhone, slugify, textField } from "../validation";
import { addDays } from "../dates";
import { audit } from "../audit";
import { notify } from "../notify";

export const businessSchema = z.object({
  name: textField(2, 80, "Business name"),
  description: z.string().max(2000).optional().default(""),
  phone: optionalPhone,
  email: z.string().trim().toLowerCase().email("Enter a valid email.").optional().or(z.literal("")).transform((v) => v || null),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null)
    .refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), "Website must start with http:// or https://"),
  address: z.string().trim().max(200).optional().transform((v) => v || null),
  islandId: z.string().optional().nullable().transform((v) => v || null),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")).transform((v) => v || null),
});

async function uniqueSlug(name: string, excludeId?: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await prisma.business.findUnique({ where: { slug } });
    if (!taken || taken.id === excludeId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createBusiness(ownerId: string, input: z.input<typeof businessSchema>) {
  const settings = await getSettings();
  if (!settings.business.enabled) throw new UserError("Business accounts are not available right now.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
  if (!user.emailVerifiedAt) throw new UserError("Please verify your email first.");
  const count = await prisma.business.count({ where: { ownerId } });
  if (count >= 5) throw new UserError("You can create up to 5 businesses.");
  const d = businessSchema.parse(input);
  const biz = await prisma.business.create({ data: { ...d, ownerId, slug: await uniqueSlug(d.name) } });
  await audit({ actorId: ownerId, action: "business.create", entityType: "Business", entityId: biz.id, summary: `Created business ${biz.name}` });
  return biz;
}

export async function updateBusiness(id: string, ownerId: string, input: z.input<typeof businessSchema>, files: { logoFileId?: string | null; bannerFileId?: string | null } = {}) {
  const biz = await prisma.business.findUnique({ where: { id } });
  if (!biz) throw new NotFoundError();
  if (biz.ownerId !== ownerId) throw new ForbiddenError();
  const d = businessSchema.parse(input);
  return prisma.business.update({
    where: { id },
    data: { ...d, slug: d.name !== biz.name ? await uniqueSlug(d.name, id) : biz.slug, ...(files.logoFileId !== undefined ? { logoFileId: files.logoFileId } : {}), ...(files.bannerFileId !== undefined ? { bannerFileId: files.bannerFileId } : {}) },
  });
}

/** Creates a pending subscription; it becomes ACTIVE once the payment slip is verified. */
export async function requestSubscription(businessId: string, ownerId: string, planId: string) {
  const biz = await prisma.business.findUnique({ where: { id: businessId } });
  if (!biz) throw new NotFoundError();
  if (biz.ownerId !== ownerId) throw new ForbiddenError();
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) throw new UserError("Choose an available plan.");
  const pending = await prisma.businessSubscription.findFirst({ where: { businessId, status: "PENDING_PAYMENT" } });
  if (pending) {
    if (pending.planId === planId) return pending;
    await prisma.businessSubscription.update({ where: { id: pending.id }, data: { status: "CANCELLED" } });
  }
  return prisma.businessSubscription.create({ data: { businessId, planId, price: plan.price, status: "PENDING_PAYMENT" } });
}

export async function activateSubscription(subscriptionId: string) {
  const sub = await prisma.businessSubscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: { plan: true } });
  const now = new Date();
  // Extend from the end of any currently active subscription so renewals don't lose days.
  const current = await prisma.businessSubscription.findFirst({ where: { businessId: sub.businessId, status: "ACTIVE", endsAt: { gt: now } }, orderBy: { endsAt: "desc" } });
  const startsAt = current?.endsAt ?? now;
  return prisma.businessSubscription.update({
    where: { id: subscriptionId },
    data: { status: "ACTIVE", startsAt, endsAt: addDays(startsAt, sub.plan.durationDays) },
  });
}

export async function expireSubscriptions(now = new Date()) {
  const due = await prisma.businessSubscription.findMany({ where: { status: "ACTIVE", endsAt: { lte: now } }, include: { business: true, plan: true } });
  for (const s of due) {
    await prisma.businessSubscription.update({ where: { id: s.id }, data: { status: "EXPIRED" } });
    await notify(s.business.ownerId, { type: "business", title: "Business plan expired", body: `The ${s.plan.name} plan for ${s.business.name} has expired. Renew to keep your storefront features.`, link: "/account/business" });
  }
  return due.length;
}

export async function businessAnalytics(businessId: string) {
  const listings = await prisma.listing.findMany({
    where: { businessId },
    select: { id: true, title: true, status: true, viewCount: true, price: true, publishedAt: true, _count: { select: { savedBy: true, conversations: true } } },
    orderBy: { createdAt: "desc" },
  });
  const totals = listings.reduce(
    (a, l) => ({ views: a.views + l.viewCount, saves: a.saves + l._count.savedBy, chats: a.chats + l._count.conversations }),
    { views: 0, saves: 0, chats: 0 },
  );
  return {
    listings,
    totals: { ...totals, live: listings.filter((l) => l.status === "PUBLISHED").length, sold: listings.filter((l) => l.status === "SOLD").length },
  };
}

/** Feature one of the business's live listings on the homepage, within the plan's featured slots. */
export async function featureListing(businessId: string, ownerId: string, listingId: string, days = 7) {
  const biz = await prisma.business.findUnique({ where: { id: businessId } });
  if (!biz || biz.ownerId !== ownerId) throw new ForbiddenError();
  const now = new Date();
  const sub = await prisma.businessSubscription.findFirst({ where: { businessId, status: "ACTIVE", endsAt: { gt: now } }, include: { plan: true } });
  if (!sub || sub.plan.featuredSlots <= 0) throw new UserError("Your plan does not include featured listings.");
  const inUse = await prisma.listing.count({ where: { businessId, featuredUntil: { gt: now }, status: "PUBLISHED", NOT: { id: listingId } } });
  if (inUse >= sub.plan.featuredSlots) throw new UserError(`All ${sub.plan.featuredSlots} featured slots are in use.`);
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.businessId !== businessId || listing.status !== "PUBLISHED") throw new UserError("Choose a live listing from this business.");
  const until = addDays(now, days);
  return prisma.listing.update({ where: { id: listingId }, data: { featuredUntil: sub.endsAt && sub.endsAt < until ? sub.endsAt : until } });
}

export async function adminSetBusinessVerified(businessId: string, adminId: string, verified: boolean) {
  const biz = await prisma.business.update({ where: { id: businessId }, data: { verified, verifiedAt: verified ? new Date() : null } });
  await audit({ actorId: adminId, action: verified ? "business.verify" : "business.unverify", entityType: "Business", entityId: businessId, summary: `${verified ? "Verified" : "Unverified"} ${biz.name}` });
  if (verified) await notify(biz.ownerId, { type: "business", title: "Business verified", body: `${biz.name} is now a verified business on MV Markets.`, link: `/business/${biz.slug}` });
}

export async function adminSetBusinessStatus(businessId: string, adminId: string, status: "ACTIVE" | "SUSPENDED", reason: string) {
  if (!reason.trim()) throw new UserError("A reason is required.");
  const biz = await prisma.business.update({ where: { id: businessId }, data: { status } });
  await audit({ actorId: adminId, action: `business.${status.toLowerCase()}`, entityType: "Business", entityId: businessId, summary: `${status} ${biz.name}: ${reason}` });
}
