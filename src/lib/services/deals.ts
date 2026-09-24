import { prisma } from "../db";
import { getSettings } from "../settings";
import { UserError, NotFoundError, ForbiddenError } from "../errors";
import { DAY_MS, daysAgo, startOfMvDay } from "../dates";
import { notify } from "../notify";
import { audit } from "../audit";
import { recomputeSellerStats } from "./reputation";
import { evaluateVip } from "./vip";

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
export async function markListingSold(listingId: string, sellerId: string, buyerId: string | null) {
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

  const deal = await prisma.$transaction(async (tx) => {
    await tx.listing.update({ where: { id: listingId }, data: { status: "SOLD", soldAt: now } });
    return tx.successfulDeal.create({
      data: {
        listingId,
        sellerId,
        buyerId: buyer?.id ?? null,
        price: listing.price,
        status: buyer ? "PENDING_CONFIRMATION" : "UNCONFIRMED",
        countsTowardStats: reasons.length === 0,
        ineligibleReason: reasons.length ? reasons.join("; ") : null,
      },
    });
  });

  if (buyer) {
    await notify(buyer.id, {
      type: "deal",
      title: "Please confirm your purchase",
      body: `The seller marked "${listing.title}" as sold to you. Please confirm if you completed this purchase.`,
      link: "/account/purchases",
      event: "deals",
    });
  }
  await recomputeSellerStats(sellerId, settings);
  await evaluateVip(sellerId);
  return deal;
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
