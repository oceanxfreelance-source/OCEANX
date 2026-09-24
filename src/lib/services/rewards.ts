import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { getSettings, type Settings } from "../settings";
import { UserError, NotFoundError } from "../errors";
import { monthRange } from "../dates";
import { formatMVR } from "../money";
import { audit } from "../audit";
import { notify } from "../notify";
import { countedDealStatuses } from "./reputation";

/**
 * Monthly VIP reward / profit-sharing.
 *   pool = eligible monthly profit (entered/approved by OceanX) × reward percentage
 * The pool is split among eligible VIP users with the formula configured in settings.rewards
 * (weighted by metrics, or equal split). Everything is snapshotted on the pool for transparency.
 */

export const poolInputSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM"),
  eligibleProfit: z.number().int().min(0),
  rewardPercent: z.number().min(0).max(100),
  profitNote: z.string().max(1000).optional().default(""),
});

export function poolAmount(eligibleProfit: number, percent: number) {
  return Math.floor((eligibleProfit * percent) / 100);
}

type Metrics = { deals: number; listings: number; referrals: number; stars: number };

/** Largest-remainder rounding so allocations always add up exactly to the pool. */
export function splitPool(pool: number, scores: { userId: string; score: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const total = scores.reduce((a, s) => a + s.score, 0);
  if (pool <= 0 || total <= 0) {
    scores.forEach((s) => out.set(s.userId, 0));
    return out;
  }
  const raw = scores.map((s) => ({ userId: s.userId, exact: (pool * s.score) / total }));
  let assigned = 0;
  raw.forEach((r) => {
    const v = Math.floor(r.exact);
    out.set(r.userId, v);
    assigned += v;
  });
  const remainder = pool - assigned;
  raw
    .sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || a.userId.localeCompare(b.userId))
    .slice(0, remainder)
    .forEach((r) => out.set(r.userId, out.get(r.userId)! + 1));
  return out;
}

export function scoreFor(m: Metrics, settings: Settings): number {
  if (settings.rewards.method === "equal") return 1;
  const w = settings.rewards.weights;
  return m.deals * w.deals + m.listings * w.listings + m.referrals * w.referrals + m.stars * w.stars;
}

async function eligibleVips(month: string, settings: Settings) {
  const { start, end } = monthRange(month);
  // VIP during the month: active at month end, or (if not required) active at any point during the month.
  const vips = await prisma.vipStatus.findMany({
    where: settings.rewards.requireActiveVipAtMonthEnd
      ? { state: "ACTIVE", since: { lt: end }, expiresAt: { gte: end } }
      : { since: { lt: end }, expiresAt: { gt: start }, state: { in: ["ACTIVE", "EXPIRED"] } },
    select: { userId: true, user: { select: { status: true } } },
  });
  const statuses = countedDealStatuses(settings);
  const out: { userId: string; metrics: Metrics }[] = [];
  for (const v of vips) {
    if (v.user.status !== "ACTIVE") continue;
    const [deals, listings, referrals, stats] = await Promise.all([
      prisma.successfulDeal.count({ where: { sellerId: v.userId, countsTowardStats: true, status: { in: statuses }, createdAt: { gte: start, lt: end } } }),
      prisma.listing.count({ where: { sellerId: v.userId, publishedAt: { gte: start, lt: end } } }),
      settings.referrals.enabled ? prisma.referral.count({ where: { referrerId: v.userId, status: "VERIFIED", verifiedAt: { gte: start, lt: end } } }) : 0,
      prisma.sellerStatistics.findUnique({ where: { userId: v.userId }, select: { stars: true } }),
    ]);
    if (deals < settings.rewards.minDealsInMonth) continue;
    out.push({ userId: v.userId, metrics: { deals, listings, referrals, stars: stats?.stars ?? 0 } });
  }
  return out;
}

export async function createOrUpdatePool(input: z.input<typeof poolInputSchema>, adminId: string) {
  const d = poolInputSchema.parse(input);
  const existing = await prisma.vipRewardPool.findUnique({ where: { month: d.month } });
  if (existing && existing.status !== "DRAFT" && existing.status !== "CALCULATED") throw new UserError("This month's pool is already approved and can no longer be edited.");
  const settings = await getSettings();
  const amount = poolAmount(d.eligibleProfit, d.rewardPercent);
  const data = { eligibleProfit: d.eligibleProfit, rewardPercent: d.rewardPercent, poolAmount: amount, profitNote: d.profitNote || null, formula: { method: settings.rewards.method, weights: settings.rewards.weights } as Prisma.InputJsonValue };
  const pool = existing
    ? await prisma.vipRewardPool.update({ where: { id: existing.id }, data: { ...data, status: "DRAFT" } })
    : await prisma.vipRewardPool.create({ data: { ...data, month: d.month, createdById: adminId } });
  if (existing) await prisma.vipRewardAllocation.deleteMany({ where: { poolId: pool.id } });
  await audit({ actorId: adminId, action: "rewards.pool_saved", entityType: "VipRewardPool", entityId: pool.id, summary: `${d.month}: profit ${formatMVR(d.eligibleProfit)} × ${d.rewardPercent}% = pool ${formatMVR(amount)}`, metadata: { ...d } });
  return pool;
}

export async function calculatePool(poolId: string, adminId: string) {
  const pool = await prisma.vipRewardPool.findUnique({ where: { id: poolId } });
  if (!pool) throw new NotFoundError();
  if (pool.status !== "DRAFT" && pool.status !== "CALCULATED") throw new UserError("Approved pools cannot be recalculated.");
  const settings = await getSettings();
  const vips = await eligibleVips(pool.month, settings);
  const scored = vips.map((v) => ({ ...v, score: scoreFor(v.metrics, settings) }));
  const amounts = splitPool(pool.poolAmount, scored);
  await prisma.$transaction(async (tx) => {
    await tx.vipRewardAllocation.deleteMany({ where: { poolId } });
    for (const s of scored) {
      const amt = amounts.get(s.userId) ?? 0;
      await tx.vipRewardAllocation.create({ data: { poolId, userId: s.userId, metrics: s.metrics as Prisma.InputJsonValue, score: s.score, calculatedAmount: amt, finalAmount: amt } });
    }
    await tx.vipRewardPool.update({ where: { id: poolId }, data: { status: "CALCULATED", calculatedAt: new Date(), formula: { method: settings.rewards.method, weights: settings.rewards.weights } as Prisma.InputJsonValue } });
  });
  await audit({ actorId: adminId, action: "rewards.calculated", entityType: "VipRewardPool", entityId: poolId, summary: `Calculated ${pool.month}: ${scored.length} eligible VIP users` });
  return scored.length;
}

export async function adjustAllocation(allocationId: string, adminId: string, adjustment: number, reason: string) {
  if (!reason.trim()) throw new UserError("A reason is required for adjustments.");
  const a = await prisma.vipRewardAllocation.findUnique({ where: { id: allocationId }, include: { pool: true } });
  if (!a) throw new NotFoundError();
  if (a.pool.status !== "CALCULATED") throw new UserError("Adjustments are only possible before the pool is approved.");
  if (a.calculatedAmount + adjustment < 0) throw new UserError("Final reward cannot be negative.");
  await prisma.vipRewardAllocation.update({ where: { id: allocationId }, data: { adjustment, adjustmentReason: reason, finalAmount: a.calculatedAmount + adjustment } });
  await audit({ actorId: adminId, action: "rewards.adjusted", entityType: "VipRewardAllocation", entityId: allocationId, summary: `Adjusted by ${formatMVR(adjustment)}: ${reason}` });
}

export async function setAllocationWithheld(allocationId: string, adminId: string, withheld: boolean, reason: string) {
  if (!reason.trim()) throw new UserError("A reason is required.");
  const a = await prisma.vipRewardAllocation.findUnique({ where: { id: allocationId } });
  if (!a) throw new NotFoundError();
  if (a.status === "PAID") throw new UserError("This reward is already paid.");
  await prisma.vipRewardAllocation.update({ where: { id: allocationId }, data: { status: withheld ? "WITHHELD" : "APPROVED", adjustmentReason: reason } });
  await audit({ actorId: adminId, action: withheld ? "rewards.withheld" : "rewards.released", entityType: "VipRewardAllocation", entityId: allocationId, summary: reason });
}

export async function approvePool(poolId: string, adminId: string) {
  const pool = await prisma.vipRewardPool.findUnique({ where: { id: poolId }, include: { allocations: true } });
  if (!pool) throw new NotFoundError();
  if (pool.status !== "CALCULATED") throw new UserError("Calculate the pool before approving it.");
  const total = pool.allocations.reduce((a, x) => a + x.finalAmount, 0);
  if (total > pool.poolAmount) throw new UserError(`Allocations (${formatMVR(total)}) exceed the pool (${formatMVR(pool.poolAmount)}). Reduce adjustments first.`);
  await prisma.$transaction([
    prisma.vipRewardPool.update({ where: { id: poolId }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: adminId } }),
    prisma.vipRewardAllocation.updateMany({ where: { poolId, status: "PENDING" }, data: { status: "APPROVED" } }),
  ]);
  await audit({ actorId: adminId, action: "rewards.approved", entityType: "VipRewardPool", entityId: poolId, summary: `Approved ${pool.month} rewards totalling ${formatMVR(total)}` });
  for (const a of pool.allocations) {
    if (a.finalAmount > 0 && a.status !== "WITHHELD") {
      await notify(a.userId, { type: "reward", title: "VIP reward approved", body: `Your VIP reward for ${pool.month} is ${formatMVR(a.finalAmount)}. It will be paid soon.`, link: "/account/vip", event: "rewards" });
    }
  }
}

export async function recordRewardPayment(allocationId: string, adminId: string, p: { method: string; reference: string; paidAt: Date; note?: string }) {
  const a = await prisma.vipRewardAllocation.findUnique({ where: { id: allocationId }, include: { pool: true } });
  if (!a) throw new NotFoundError();
  if (a.status !== "APPROVED") throw new UserError("Only approved rewards can be marked as paid.");
  await prisma.$transaction([
    prisma.vipRewardPayment.create({ data: { allocationId, amount: a.finalAmount, method: p.method || null, reference: p.reference || null, paidAt: p.paidAt, recordedById: adminId, note: p.note || null } }),
    prisma.vipRewardAllocation.update({ where: { id: allocationId }, data: { status: "PAID" } }),
  ]);
  const remaining = await prisma.vipRewardAllocation.count({ where: { poolId: a.poolId, status: { in: ["PENDING", "APPROVED"] }, finalAmount: { gt: 0 } } });
  if (remaining === 0) await prisma.vipRewardPool.update({ where: { id: a.poolId }, data: { status: "PAID" } });
  await audit({ actorId: adminId, action: "rewards.paid", entityType: "VipRewardAllocation", entityId: allocationId, summary: `Paid ${formatMVR(a.finalAmount)} for ${a.pool.month} via ${p.method || "—"} ${p.reference || ""}` });
  await notify(a.userId, { type: "reward", title: "VIP reward paid", body: `Your VIP reward of ${formatMVR(a.finalAmount)} for ${a.pool.month} has been paid.`, link: "/account/vip", event: "rewards" });
}

/** A user's own reward history — never includes other users' data. */
export async function userRewardHistory(userId: string) {
  return prisma.vipRewardAllocation.findMany({
    where: { userId, pool: { status: { in: ["APPROVED", "PAID"] } } },
    include: { pool: { select: { month: true, status: true } }, payments: { select: { paidAt: true, amount: true } } },
    orderBy: { pool: { month: "desc" } },
  });
}
