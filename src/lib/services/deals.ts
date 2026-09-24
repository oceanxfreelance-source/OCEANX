import { prisma } from "../db";
import { getSettings } from "../settings";
import { UserError, NotFoundError, ForbiddenError } from "../errors";
import { DAY_MS, daysAgo, startOfMvDay } from "../dates";
import { notify } from "../notify";
import { audit } from "../audit";
import { recomputeSellerStats } from "./reputation";
import { evaluateVip } from "./vip";
import { processSlipFile } from "./payments";
import { saveFile } from "../storage";
import { hasPermission } from "../permissions";

export type ProofUpload = { buffer: Buffer; mimeType: string };
export const MAX_SALE_PROOFS = 3;

/** Validate and store proof files privately (only the seller and admins can open them). */
async function storeProofs(sellerId: string, files: ProofUpload[]) {
  const real = files.filter((f) => f.buffer.length > 0);
  if (real.length === 0) throw new UserError("Please add proof of the sale — for example a transfer screenshot, receipt or handover photo.");
  if (real.length > MAX_SALE_PROOFS) throw new UserError(`Please add at most ${MAX_SALE_PROOFS} files.`);
  const ids: string[] = [];
  for (const f of real) {
    const p = await processSlipFile(f.buffer, f.mimeType, "proof of sale");
    const stored = await saveFile({ buffer: p.buffer, mimeType: p.mimeType, visibility: "PRIVATE", purpose: "sale_proof", ownerId: sellerId, width: p.width, height: p.height, sha: p.originalHash });
    ids.push(stored.id);
  }
  return ids;
}

/** Tell admins who review deals that proof is waiting. */
async function notifyDealReviewers(title: string, body: string) {
  const admins = await prisma.user.findMany({ where: { adminRoleId: { not: null }, status: "ACTIVE" }, select: { id: true, adminRole: { select: { permissions: true } } } });
  for (const a of admins) {
    if (hasPermission(a.adminRole?.permissions, "vip")) await notify(a.id, { type: "deal", title, body, link: "/admin/deals?status=proof" });
  }
}

/** Users who messaged the seller about this listing — the only people who can be named as the buyer. */
export async function buyerCandidates(listingId: string, sellerId: string) {
  const convs = await prisma.conversation.findMany({
    where: { listingId, sellerId, messages: { some: {} } },
    select: { buyer: { select: { id: true, name: true } } },
  });
  return convs.map((c) => c.buyer);
}

/**
 * Seller marks a published listing as SOLD. A SuccessfulDeal is recorded and checked against
 * anti-manipulation rules. Only eligible deals (and, by default, only buyer-confirmed ones)
 * count toward Stars and VIP.
 */
export async function markListingSold(listingId: string, sellerId: string, buyerId: string | null, proof: { files: ProofUpload[]; note?: string } = { files: [] }) {
  const settings = await getSettings();
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new NotFoundError();
  if (listing.sellerId !== sellerId) throw new ForbiddenError();
  if (listing.status !== "PUBLISHED") throw new UserError("Only live listings can be marked as sold.");

  let buyer = null;
  if (buyerId) {
    if (buyerId === sellerId) throw new UserError("You cannot be the buyer of your own listing.");
    const candidates = await buyerCandidates(listingId, sellerId);
    if (!candidates.some((c) => c.id === buyerId)) throw new UserError("The buyer must be someone who contacted you about this listing on MV Markets.");
    buyer = await prisma.user.findUnique({ where: { id: buyerId } });
  }

  const now = new Date();
  const reasons: string[] = [];
  if (listing.price < settings.deals.minDealPrice) reasons.push("Price below the minimum for counted deals");
  if (listing.publishedAt && now.getTime() - listing.publishedAt.getTime() < settings.deals.minHoursPublishedBeforeSale * 3600_000) {
    reasons.push(`Marked sold within ${settings.deals.minHoursPublishedBeforeSale} hours of publishing`);
  }
  const countedToday = await prisma.successfulDeal.count({ where: { sellerId, countsTowardStats: true, createdAt: { gte: startOfMvDay(now) } } });
  if (countedToday >= settings.deals.maxCountedDealsPerDay) reasons.push("Daily limit of counted deals reached");
  if (buyer) {
    const samePair = await prisma.successfulDeal.count({ where: { sellerId, buyerId: buyer.id, countsTowardStats: true, createdAt: { gte: daysAgo(30, now) } } });
    if (samePair >= settings.deals.maxDealsSamePairPer30Days) reasons.push("Repeated deals with the same buyer in 30 days");
    if (now.getTime() - buyer.createdAt.getTime() < settings.deals.buyerMinAccountAgeDays * DAY_MS) reasons.push("Buyer account is too new");
    if (buyer.status !== "ACTIVE") reasons.push("Buyer account is not active");
  }

  const needProof = settings.deals.requireSaleProof;
  const existing = await prisma.successfulDeal.findUnique({ where: { listingId }, select: { proofStatus: true } });
  if (existing) {
    throw new UserError(existing.proofStatus === "REJECTED" ? "Your sold request needs better proof — please upload new proof." : "A sold request for this listing is already waiting for review.");
  }
  const proofFileIds = needProof ? await storeProofs(sellerId, proof.files) : [];

  // With proof required this is a "sold request": the listing stays live until an admin accepts the proof,
  // then it is marked SOLD automatically (see reviewSaleProof). Without proof it is marked SOLD right away.
  const deal = await prisma.$transaction(async (tx) => {
    if (!needProof) await tx.listing.update({ where: { id: listingId }, data: { status: "SOLD", soldAt: now } });
    return tx.successfulDeal.create({
      data: {
        proofStatus: needProof ? "PENDING" : "NOT_REQUIRED",
        proofNote: needProof ? proof.note?.trim().slice(0, 500) || null : null,
        proofs: { create: proofFileIds.map((fileId) => ({ fileId })) },
        listingId,
        sellerId,
        buyerId: buyer?.id ?? null,
        price: listing.price,
        status: buyer && !needProof ? "PENDING_CONFIRMATION" : "UNCONFIRMED",
        countsTowardStats: reasons.length === 0,
        ineligibleReason: reasons.length ? reasons.join("; ") : null,
      },
    });
  });

  if (buyer && !needProof) {
    await notify(buyer.id, {
      type: "deal",
      title: "Please confirm your purchase",
      body: `The seller marked "${listing.title}" as sold to you. Please confirm if you completed this purchase.`,
      link: "/account/purchases",
      event: "deals",
    });
  }
  if (needProof) await notifyDealReviewers("Proof of sale to review", `"${listing.title}" was marked sold. Please check the proof.`);
  await recomputeSellerStats(sellerId, settings);
  await evaluateVip(sellerId);
  return deal;
}

/** Seller uploads new proof after an admin asked for better proof (or proof is still missing). */
export async function resubmitSaleProof(dealId: string, sellerId: string, proof: { files: ProofUpload[]; note?: string }) {
  const deal = await prisma.successfulDeal.findUnique({ where: { id: dealId }, include: { listing: { select: { title: true } } } });
  if (!deal) throw new NotFoundError();
  if (deal.sellerId !== sellerId) throw new ForbiddenError();
  if (deal.status === "VOIDED") throw new UserError("This sale was cancelled by OceanX.");
  if (deal.proofStatus !== "REJECTED") throw new UserError(deal.proofStatus === "APPROVED" ? "Your proof was already accepted." : "Your proof is already waiting for review.");
  const listing = await prisma.listing.findUnique({ where: { id: deal.listingId }, select: { status: true } });
  if (listing?.status !== "PUBLISHED") throw new UserError("Only live listings can be marked as sold.");
  const ids = await storeProofs(sellerId, proof.files);
  await prisma.successfulDeal.update({
    where: { id: dealId },
    data: { proofStatus: "PENDING", proofNote: proof.note?.trim().slice(0, 500) || null, proofReviewNote: null, proofReviewedAt: null, proofs: { create: ids.map((fileId) => ({ fileId })) } },
  });
  await notifyDealReviewers("New proof of sale to review", `The seller sent new proof for "${deal.listing.title}".`);
}

/**
 * Admin accepts or rejects proof of sale. Accepting also confirms the deal (the admin has seen evidence),
 * so it counts toward Stars/VIP if it passes the other anti-manipulation rules. Rejecting keeps it uncounted
 * and lets the seller send better proof.
 */
export async function reviewSaleProof(dealId: string, adminId: string, decision: "approve" | "reject", note: string) {
  const deal = await prisma.successfulDeal.findUnique({ where: { id: dealId }, include: { listing: { select: { title: true } } } });
  if (!deal) throw new NotFoundError();
  if (deal.proofStatus !== "PENDING") throw new UserError("This proof has already been reviewed.");
  const reason = note.trim().slice(0, 500);
  if (decision === "reject" && !reason) throw new UserError("Tell the seller why the proof was not accepted.");
  const now = new Date();
  if (decision === "approve") {
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: deal.listingId }, select: { status: true } });
    if (listing.status !== "PUBLISHED" && listing.status !== "SOLD") {
      throw new UserError(`This listing is no longer live (${listing.status.toLowerCase().replace("_", " ")}). Reject the request instead.`);
    }
    await prisma.$transaction([
      prisma.listing.update({ where: { id: deal.listingId }, data: { status: "SOLD", soldAt: now } }),
      prisma.successfulDeal.update({
        where: { id: dealId },
        data: { proofStatus: "APPROVED", proofReviewNote: reason || null, proofReviewedAt: now, reviewedById: adminId, status: "CONFIRMED", confirmedAt: deal.confirmedAt ?? now },
      }),
    ]);
  } else {
    await prisma.successfulDeal.update({ where: { id: dealId }, data: { proofStatus: "REJECTED", proofReviewNote: reason, proofReviewedAt: now, reviewedById: adminId } });
  }
  await audit({ actorId: adminId, action: `deal.proof.${decision}`, entityType: "SuccessfulDeal", entityId: dealId, summary: `Proof of sale ${decision === "approve" ? "accepted" : "rejected"} for "${deal.listing.title}"${reason ? `: ${reason}` : ""}` });
  await notify(
    deal.sellerId,
    decision === "approve"
      ? { type: "deal", title: "Sale accepted — marked as SOLD", body: `Your proof for "${deal.listing.title}" was accepted. The listing is now marked SOLD and the sale counts on your profile.`, link: "/account/listings?tab=sold", event: "deals" }
      : { type: "deal", title: "Please send better proof of sale", body: `We couldn't accept the proof for "${deal.listing.title}", so it is still live: ${reason}`, link: `/account/listings/${deal.listingId}/proof`, event: "deals" },
  );
  if (decision === "approve" && deal.buyerId) {
    await notify(deal.buyerId, { type: "deal", title: "Purchase recorded", body: `"${deal.listing.title}" was recorded as sold to you. Thanks for using MV Markets!`, link: "/account/purchases" });
  }
  await recomputeSellerStats(deal.sellerId);
  await evaluateVip(deal.sellerId);
}

export async function confirmDeal(dealId: string, buyerId: string) {
  const deal = await prisma.successfulDeal.findUnique({ where: { id: dealId }, include: { listing: true } });
  if (!deal) throw new NotFoundError();
  if (deal.buyerId !== buyerId) throw new ForbiddenError();
  if (deal.status !== "PENDING_CONFIRMATION") throw new UserError("This purchase has already been answered.");
  await prisma.successfulDeal.update({ where: { id: dealId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  await notify(deal.sellerId, { type: "deal", title: "Sale confirmed", body: `The buyer confirmed the sale of "${deal.listing.title}".`, link: "/account/listings", event: "deals" });
  await recomputeSellerStats(deal.sellerId);
  await evaluateVip(deal.sellerId);
}

export async function disputeDeal(dealId: string, buyerId: string, reason: string) {
  const deal = await prisma.successfulDeal.findUnique({ where: { id: dealId }, include: { listing: true } });
  if (!deal) throw new NotFoundError();
  if (deal.buyerId !== buyerId) throw new ForbiddenError();
  if (deal.status !== "PENDING_CONFIRMATION") throw new UserError("This purchase has already been answered.");
  await prisma.successfulDeal.update({ where: { id: dealId }, data: { status: "DISPUTED", disputedReason: reason.slice(0, 500) || "Buyer says the purchase did not happen" } });
  await recomputeSellerStats(deal.sellerId);
}

export async function autoConfirmDeals(now = new Date()) {
  const settings = await getSettings();
  if (settings.deals.autoConfirmDays <= 0) return 0;
  const due = await prisma.successfulDeal.findMany({
    where: { status: "PENDING_CONFIRMATION", createdAt: { lte: new Date(now.getTime() - settings.deals.autoConfirmDays * DAY_MS) } },
    select: { id: true, sellerId: true },
  });
  for (const d of due) {
    await prisma.successfulDeal.update({ where: { id: d.id }, data: { status: "CONFIRMED", confirmedAt: now } });
  }
  for (const sellerId of new Set(due.map((d) => d.sellerId))) {
    await recomputeSellerStats(sellerId, settings);
    await evaluateVip(sellerId);
  }
  return due.length;
}

export async function adminReviewDeal(
  dealId: string,
  adminId: string,
  action: "confirm" | "void" | "count" | "exclude",
  reason: string,
) {
  if (!reason.trim()) throw new UserError("A reason is required.");
  const deal = await prisma.successfulDeal.findUnique({ where: { id: dealId } });
  if (!deal) throw new NotFoundError();
  const data =
    action === "confirm"
      ? { status: "CONFIRMED" as const, confirmedAt: new Date() }
      : action === "void"
        ? { status: "VOIDED" as const, voidReason: reason, countsTowardStats: false }
        : action === "count"
          ? { countsTowardStats: true, ineligibleReason: `Counted by admin: ${reason}` }
          : { countsTowardStats: false, ineligibleReason: `Excluded by admin: ${reason}` };
  await prisma.successfulDeal.update({ where: { id: dealId }, data: { ...data, reviewedById: adminId } });
  await audit({ actorId: adminId, action: `deal.${action}`, entityType: "SuccessfulDeal", entityId: dealId, summary: `Deal ${action}: ${reason}` });
  await recomputeSellerStats(deal.sellerId);
  await evaluateVip(deal.sellerId);
}
