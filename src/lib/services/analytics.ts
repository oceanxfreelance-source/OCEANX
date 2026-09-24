import type { PaymentPurpose } from "@prisma/client";
import { prisma } from "../db";
import { startOfMvDay, daysAgo, MV_OFFSET_MS } from "../dates";

function startOfMvMonth(d = new Date()) {
  const l = new Date(d.getTime() + MV_OFFSET_MS);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1) - MV_OFFSET_MS);
}
function startOfMvYear(d = new Date()) {
  const l = new Date(d.getTime() + MV_OFFSET_MS);
  return new Date(Date.UTC(l.getUTCFullYear(), 0, 1) - MV_OFFSET_MS);
}

/** Revenue = VERIFIED payments (by verification time). Refunded payments are reported separately. */
async function revenueSince(since: Date | null) {
  const where = { status: "VERIFIED" as const, ...(since ? { verifiedAt: { gte: since } } : {}) };
  const byPurpose = await prisma.payment.groupBy({ by: ["purpose"], where, _sum: { amount: true } });
  const other = await prisma.revenueEntry.aggregate({ where: since ? { occurredAt: { gte: since } } : {}, _sum: { amount: true } });
  const get = (p: PaymentPurpose) => byPurpose.find((b) => b.purpose === p)?._sum.amount ?? 0;
  const posting = get("LISTING_FEE");
  const subscriptions = get("BUSINESS_SUBSCRIPTION");
  const fines = get("CANCELLATION_FINE");
  const otherAmt = other._sum.amount ?? 0;
  return { posting, subscriptions, fines, other: otherAmt, total: posting + subscriptions + fines + otherAmt };
}

export async function revenueDashboard() {
  const now = new Date();
  const [today, week, month, year, total] = await Promise.all([
    revenueSince(startOfMvDay(now)),
    revenueSince(daysAgo(7, now)),
    revenueSince(startOfMvMonth(now)),
    revenueSince(startOfMvYear(now)),
    revenueSince(null),
  ]);
  const [refunds, rewardsPaid, rewardsApproved] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "REFUNDED" }, _sum: { amount: true }, _count: true }),
    prisma.vipRewardPayment.aggregate({ _sum: { amount: true } }),
    prisma.vipRewardAllocation.aggregate({ where: { status: "APPROVED" }, _sum: { finalAmount: true } }),
  ]);
  return {
    today,
    week,
    month,
    year,
    total,
    refunds: { amount: refunds._sum.amount ?? 0, count: refunds._count },
    vipRewards: { paid: rewardsPaid._sum.amount ?? 0, approvedUnpaid: rewardsApproved._sum.finalAmount ?? 0 },
  };
}

export async function marketplaceStats() {
  const now = new Date();
  const [users, activeUsers, listings, activeListings, soldListings, todayListings, businesses, activeSubs, pendingPayments, pendingReports, suspendedUsers, vipUsers, deals] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { lastActiveAt: { gte: daysAgo(30, now) } } }),
      prisma.listing.count({ where: { publishedAt: { not: null } } }),
      prisma.listing.count({ where: { status: "PUBLISHED" } }),
      prisma.listing.count({ where: { status: "SOLD" } }),
      prisma.listing.count({ where: { createdAt: { gte: startOfMvDay(now) } } }),
      prisma.business.count(),
      prisma.businessSubscription.count({ where: { status: "ACTIVE", endsAt: { gt: now } } }),
      prisma.payment.count({ where: { status: { in: ["AI_CHECKING", "PENDING", "NEEDS_REVIEW"] } } }),
      prisma.report.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } }),
      prisma.user.count({ where: { status: { in: ["SUSPENDED", "BANNED"] } } }),
      prisma.vipStatus.count({ where: { state: "ACTIVE", expiresAt: { gt: now } } }),
      prisma.successfulDeal.count({ where: { status: { in: ["CONFIRMED", "UNCONFIRMED"] } } }),
    ]);
  return { users, activeUsers, listings, activeListings, soldListings, todayListings, businesses, activeSubs, pendingPayments, pendingReports, suspendedUsers, vipUsers, deals };
}

/** Daily verified revenue for the last N days (Maldives time), for the dashboard chart. */
export async function dailyRevenue(days = 30) {
  const since = startOfMvDay(daysAgo(days - 1));
  const rows = await prisma.$queryRaw<{ day: Date; amount: bigint }[]>`
    SELECT date_trunc('day', "verifiedAt" + interval '5 hours') AS day, SUM(amount)::bigint AS amount
    FROM "Payment" WHERE status = 'VERIFIED' AND "verifiedAt" >= ${since}
    GROUP BY 1 ORDER BY 1`;
  const map = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.amount)]));
  const out: { day: string; amount: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + MV_OFFSET_MS + i * 86400000).toISOString().slice(0, 10);
    out.push({ day: d, amount: map.get(d) ?? 0 });
  }
  return out;
}
