import type { DealStatus, Prisma, SellerLevel } from "@prisma/client";
import { prisma } from "../db";
import { getSettings, type Settings } from "../settings";
import { daysAgo } from "../dates";
import { notify } from "../notify";

/**
 * Seller statistics are always RECOMPUTED from source records (listings, deals, cancellations,
 * referrals, admin adjustments). Nothing is incremented in place, so the numbers cannot drift
 * or be inflated by replaying requests.
 */

export function countedDealStatuses(settings: Settings): DealStatus[] {
  return settings.deals.countingMode === "include_unconfirmed" ? ["CONFIRMED", "UNCONFIRMED"] : ["CONFIRMED"];
}

/** The single rule for which deals count toward Stars, levels, VIP and rewards. */
export function countedDealWhere(settings: Settings): Prisma.SuccessfulDealWhereInput {
  return { countsTowardStats: true, status: { in: countedDealStatuses(settings) }, proofStatus: { in: ["NOT_REQUIRED", "APPROVED"] } };
}

export function computeStars(
  input: { countedDeals: number; verifiedReferrals: number; voluntaryCancellations: number; adjustments: number },
  settings: Settings,
): number {
  let stars = input.countedDeals * settings.stars.starsPerDeal;
  if (settings.referrals.enabled) stars += input.verifiedReferrals * settings.referrals.starsPerVerifiedReferral;
  if (settings.cancellation.reduceStars) stars -= input.voluntaryCancellations * settings.cancellation.starPenalty;
  stars += input.adjustments;
  return Math.max(0, stars);
}

export function pickLevel(levels: SellerLevel[], stars: number, deals: number, dropOne: boolean): SellerLevel | null {
  const active = levels.filter((l) => l.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.minStars - b.minStars);
  let idx = -1;
  active.forEach((l, i) => {
    if (stars >= l.minStars && deals >= l.minDeals) idx = i;
  });
  if (dropOne && idx > 0) idx -= 1;
  return idx >= 0 ? active[idx] : null;
}

export async function recomputeSellerStats(userId: string, settingsIn?: Settings) {
  const settings = settingsIn ?? (await getSettings());
  const vipWindowStart = daysAgo(settings.vip.windowDays);
  const cancelWindowStart = daysAgo(settings.cancellation.periodDays);

  const [published, active, sold, countedDeals, countedDealsInWindow, pendingDeals, voluntary, cancelInWindow, referrals, adj, levels, existing] =
    await Promise.all([
      prisma.listing.count({ where: { sellerId: userId, publishedAt: { not: null } } }),
      prisma.listing.count({ where: { sellerId: userId, status: "PUBLISHED" } }),
      prisma.listing.count({ where: { sellerId: userId, status: "SOLD" } }),
      prisma.successfulDeal.count({ where: { sellerId: userId, ...countedDealWhere(settings) } }),
      prisma.successfulDeal.count({ where: { sellerId: userId, ...countedDealWhere(settings), createdAt: { gte: vipWindowStart } } }),
      prisma.successfulDeal.count({ where: { sellerId: userId, status: "PENDING_CONFIRMATION" } }),
      prisma.cancellationRecord.count({ where: { sellerId: userId, countsAgainstSeller: true } }),
      prisma.cancellationRecord.count({ where: { sellerId: userId, countsAgainstSeller: true, createdAt: { gte: cancelWindowStart } } }),
      prisma.referral.count({ where: { referrerId: userId, status: "VERIFIED" } }),
      prisma.starAdjustment.aggregate({ where: { userId }, _sum: { delta: true } }),
      prisma.sellerLevel.findMany(),
      prisma.sellerStatistics.findUnique({ where: { userId } }),
    ]);

  const stars = computeStars({ countedDeals, verifiedReferrals: referrals, voluntaryCancellations: voluntary, adjustments: adj._sum.delta ?? 0 }, settings);
  const overLimit = cancelInWindow > settings.cancellation.maxPerPeriod;
  const level = pickLevel(levels, stars, countedDeals, overLimit && settings.cancellation.reduceLevelOverLimit);

  let warningIssuedAt = existing?.warningIssuedAt ?? null;
  const shouldWarn =
    overLimit && settings.cancellation.warnOverLimit && (!warningIssuedAt || warningIssuedAt < cancelWindowStart);
  if (shouldWarn) warningIssuedAt = new Date();

  const data = {
    publishedListings: published,
    activeListings: active,
    soldListings: sold,
    countedDeals,
    countedDealsInWindow,
    pendingDeals,
    voluntaryCancellations: voluntary,
    cancellationsInWindow: cancelInWindow,
    verifiedReferrals: referrals,
    stars,
    levelId: level?.id ?? null,
    underReview: (existing?.underReview ?? false) || (overLimit && settings.cancellation.triggerReviewOverLimit),
    warningIssuedAt,
    computedAt: new Date(),
  };
  const stats = await prisma.sellerStatistics.upsert({ where: { userId }, create: { userId, ...data }, update: data });

  if (shouldWarn) {
    await notify(userId, {
      type: "warning",
      title: "Frequent listing cancellations",
      body: `You have withdrawn ${cancelInWindow} published listings in the last ${settings.cancellation.periodDays} days. Frequent cancellations can affect your Stars, seller level and VIP eligibility.`,
      link: "/account/cancellations",
      event: "cancellation",
    });
  }
  return stats;
}

export async function adjustStars(userId: string, delta: number, reason: string, actorId: string) {
  await prisma.starAdjustment.create({ data: { userId, delta, reason, actorId } });
  return recomputeSellerStats(userId);
}

export async function getSellerReputation(userId: string) {
  const [stats, vip, settings] = await Promise.all([
    prisma.sellerStatistics.findUnique({ where: { userId }, include: { level: true } }),
    prisma.vipStatus.findUnique({ where: { userId } }),
    getSettings(),
  ]);
  const vipActive = !!vip && vip.state === "ACTIVE" && !!vip.expiresAt && vip.expiresAt > new Date() && settings.vip.enabled;
  return { stats, level: stats?.level ?? null, vipActive, vip, vipBadge: settings.vip.badgeName };
}
