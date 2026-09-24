import type { Prisma, VipEvent, VipState } from "@prisma/client";
import { prisma } from "../db";
import { getSettings, type Settings } from "../settings";
import { addMonths, daysAgo } from "../dates";
import { notify } from "../notify";
import { audit } from "../audit";
import { UserError } from "../errors";
import { countedDealWhere, recomputeSellerStats } from "./reputation";

export type VipEligibility = {
  eligible: boolean;
  metrics: { stars: number; totalDeals: number; dealsInWindow: number; cancellationsInWindow: number };
  requirements: { label: string; met: boolean; current: number; required: number; kind: "min" | "max" }[];
};

/** VIP is earned from genuine, counted deals — never from listing volume. */
export async function vipEligibility(userId: string, settingsIn?: Settings): Promise<VipEligibility> {
  const settings = settingsIn ?? (await getSettings());
  const stats = await recomputeSellerStats(userId, settings);
  const windowStart = daysAgo(settings.vip.windowDays);
  const [dealsInWindow, cancellationsInWindow] = await Promise.all([
    prisma.successfulDeal.count({
      where: { sellerId: userId, ...countedDealWhere(settings), createdAt: { gte: windowStart } },
    }),
    prisma.cancellationRecord.count({ where: { sellerId: userId, countsAgainstSeller: true, createdAt: { gte: windowStart } } }),
  ]);
  const v = settings.vip;
  const requirements: VipEligibility["requirements"] = [
    { label: "Stars", current: stats.stars, required: v.minStars, met: stats.stars >= v.minStars, kind: "min" },
    { label: "Successful deals (all time)", current: stats.countedDeals, required: v.minDealsTotal, met: stats.countedDeals >= v.minDealsTotal, kind: "min" },
    { label: `Successful deals (last ${v.windowDays} days)`, current: dealsInWindow, required: v.minDealsInWindow, met: dealsInWindow >= v.minDealsInWindow, kind: "min" },
  ];
  if (settings.cancellation.affectsVipEligibility) {
    requirements.push({
      label: `Voluntary cancellations (last ${v.windowDays} days)`,
      current: cancellationsInWindow,
      required: v.maxCancellationsInWindow,
      met: cancellationsInWindow <= v.maxCancellationsInWindow,
      kind: "max",
    });
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  return {
    eligible: user?.status === "ACTIVE" && requirements.every((r) => r.met),
    metrics: { stars: stats.stars, totalDeals: stats.countedDeals, dealsInWindow, cancellationsInWindow },
    requirements,
  };
}

export function isVipActiveRecord(vip: { state: VipState; expiresAt: Date | null } | null | undefined, now = new Date()): boolean {
  return !!vip && vip.state === "ACTIVE" && !!vip.expiresAt && vip.expiresAt > now;
}

export async function isVipActive(userId: string): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.vip.enabled) return false;
  const vip = await prisma.vipStatus.findUnique({ where: { userId } });
  return isVipActiveRecord(vip);
}

async function record(userId: string, event: VipEvent, data: { reason?: string | null; actorId?: string | null; expiresAt?: Date | null; snapshot?: unknown }) {
  await prisma.vipHistory.create({
    data: {
      userId,
      event,
      reason: data.reason ?? null,
      actorId: data.actorId ?? null,
      expiresAt: data.expiresAt ?? null,
      snapshot: (data.snapshot ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

async function grant(userId: string, settings: Settings, snapshot: unknown, actorId: string | null, reason: string | null, event: VipEvent = "GRANTED") {
  const now = new Date();
  const expiresAt = addMonths(now, settings.vip.durationMonths);
  await prisma.vipStatus.upsert({
    where: { userId },
    create: { userId, state: "ACTIVE", since: now, expiresAt, lastEvaluatedAt: now },
    update: { state: "ACTIVE", since: now, expiresAt, renewals: 0, suspendedReason: null, lastEvaluatedAt: now },
  });
  await record(userId, event, { reason, actorId, expiresAt, snapshot });
  await notify(userId, {
    type: "vip",
    title: `You are now ${settings.vip.badgeName}`,
    body: `Congratulations — your genuine selling activity earned you ${settings.vip.badgeName} status until ${expiresAt.toDateString()}. Your posting fee is now reduced and you are eligible for the monthly VIP reward pool.`,
    link: "/account/vip",
    event: "vip",
  });
}

/**
 * Evaluates one user's VIP state:
 *  - NONE/EXPIRED + eligible  → ACTIVE (or PENDING_APPROVAL when admin approval is required)
 *  - ACTIVE and period ended  → renewed for another period if still eligible, otherwise EXPIRED
 *  - ACTIVE and too many cancellations → SUSPENDED (only when that rule is enabled)
 *  - SUSPENDED / PENDING_APPROVAL are left for an admin decision.
 */
export async function evaluateVip(userId: string, now = new Date()): Promise<VipState> {
  const settings = await getSettings();
  const vip = await prisma.vipStatus.upsert({ where: { userId }, create: { userId }, update: {} });
  if (!settings.vip.enabled) return vip.state;
  if (vip.state === "SUSPENDED" || vip.state === "PENDING_APPROVAL") return vip.state;

  const elig = await vipEligibility(userId, settings);

  if (vip.state === "ACTIVE") {
    if (vip.expiresAt && vip.expiresAt <= now) {
      if (elig.eligible) {
        const expiresAt = addMonths(vip.expiresAt, settings.vip.durationMonths);
        const finalExpiry = expiresAt > now ? expiresAt : addMonths(now, settings.vip.durationMonths);
        await prisma.vipStatus.update({ where: { userId }, data: { expiresAt: finalExpiry, renewals: { increment: 1 }, lastEvaluatedAt: now } });
        await record(userId, "RENEWED", { reason: "Requirements still met at end of VIP period", expiresAt: finalExpiry, snapshot: elig.metrics });
        await notify(userId, {
          type: "vip",
          title: `${settings.vip.badgeName} renewed`,
          body: `Great selling! Your ${settings.vip.badgeName} status has been renewed until ${finalExpiry.toDateString()}.`,
          link: "/account/vip",
          event: "vip",
        });
        return "ACTIVE";
      }
      await prisma.vipStatus.update({ where: { userId }, data: { state: "EXPIRED", lastEvaluatedAt: now } });
      await record(userId, "EXPIRED", { reason: "Requirements not met at end of VIP period", snapshot: elig });
      await notify(userId, {
        type: "vip",
        title: `${settings.vip.badgeName} period ended`,
        body: `Your ${settings.vip.badgeName} period has ended and the standard posting fee applies again. Keep completing genuine sales to qualify again.`,
        link: "/account/vip",
        event: "vip",
      });
      return "EXPIRED";
    }
    if (settings.cancellation.suspendVipOverLimit) {
      const stats = await prisma.sellerStatistics.findUnique({ where: { userId } });
      if (stats && stats.cancellationsInWindow > settings.cancellation.maxPerPeriod) {
        const reason = `More than ${settings.cancellation.maxPerPeriod} voluntary cancellations in ${settings.cancellation.periodDays} days`;
        await prisma.vipStatus.update({ where: { userId }, data: { state: "SUSPENDED", suspendedReason: reason, lastEvaluatedAt: now } });
        await record(userId, "SUSPENDED", { reason, snapshot: elig.metrics });
        await notify(userId, { type: "vip", title: `${settings.vip.badgeName} suspended`, body: `${reason}. An OceanX admin will review your account.`, link: "/account/vip", event: "vip" });
        return "SUSPENDED";
      }
    }
    await prisma.vipStatus.update({ where: { userId }, data: { lastEvaluatedAt: now } });
    return "ACTIVE";
  }

  // NONE or EXPIRED
  if (elig.eligible) {
    if (settings.vip.requireAdminApproval) {
      await prisma.vipStatus.update({ where: { userId }, data: { state: "PENDING_APPROVAL", lastEvaluatedAt: now } });
      await record(userId, "QUALIFIED", { reason: "Met all VIP requirements; awaiting admin approval", snapshot: elig.metrics });
      return "PENDING_APPROVAL";
    }
    await grant(userId, settings, elig.metrics, null, "Met all VIP requirements");
    return "ACTIVE";
  }
  await prisma.vipStatus.update({ where: { userId }, data: { lastEvaluatedAt: now } });
  return vip.state;
}

/** Daily job: handles expiries/renewals and promotes newly eligible sellers. */
export async function runVipMaintenance(now = new Date()) {
  const settings = await getSettings();
  const due = await prisma.vipStatus.findMany({ where: { state: "ACTIVE", expiresAt: { lte: now } }, select: { userId: true } });
  const candidates = await prisma.sellerStatistics.findMany({
    where: {
      stars: { gte: settings.vip.minStars },
      countedDeals: { gte: settings.vip.minDealsTotal },
      user: { status: "ACTIVE", OR: [{ vipStatus: null }, { vipStatus: { state: { in: ["NONE", "EXPIRED"] } } }] },
    },
    select: { userId: true },
  });
  const ids = [...new Set([...due.map((d) => d.userId), ...candidates.map((c) => c.userId)])];
  const results: Record<string, VipState> = {};
  for (const id of ids) results[id] = await evaluateVip(id, now);
  return { evaluated: ids.length, results };
}

// ─────────────── Admin actions (all audited) ───────────────

export async function adminApproveVip(userId: string, actorId: string, reason: string) {
  const settings = await getSettings();
  const vip = await prisma.vipStatus.findUnique({ where: { userId } });
  if (vip?.state !== "PENDING_APPROVAL") throw new UserError("This user is not awaiting VIP approval.");
  const elig = await vipEligibility(userId, settings);
  await grant(userId, settings, elig.metrics, actorId, reason || "Approved by admin", "APPROVED");
  await audit({ actorId, action: "vip.approve", entityType: "User", entityId: userId, summary: `Approved VIP: ${reason}` });
}

export async function adminRejectVip(userId: string, actorId: string, reason: string) {
  if (!reason) throw new UserError("A reason is required.");
  const vip = await prisma.vipStatus.findUnique({ where: { userId } });
  if (vip?.state !== "PENDING_APPROVAL") throw new UserError("This user is not awaiting VIP approval.");
  await prisma.vipStatus.update({ where: { userId }, data: { state: "NONE" } });
  await record(userId, "REJECTED", { reason, actorId });
  await audit({ actorId, action: "vip.reject", entityType: "User", entityId: userId, summary: `Rejected VIP: ${reason}` });
}

export async function adminSuspendVip(userId: string, actorId: string, reason: string) {
  if (!reason) throw new UserError("A reason is required.");
  const settings = await getSettings();
  const vip = await prisma.vipStatus.findUnique({ where: { userId } });
  if (vip?.state !== "ACTIVE") throw new UserError("Only active VIP status can be suspended.");
  await prisma.vipStatus.update({ where: { userId }, data: { state: "SUSPENDED", suspendedReason: reason } });
  await record(userId, "SUSPENDED", { reason, actorId });
  await audit({ actorId, action: "vip.suspend", entityType: "User", entityId: userId, summary: `Suspended VIP: ${reason}` });
  await notify(userId, { type: "vip", title: `${settings.vip.badgeName} suspended`, body: `Your ${settings.vip.badgeName} status has been suspended. Reason: ${reason}`, link: "/account/vip", event: "vip" });
}

export async function adminRestoreVip(userId: string, actorId: string, reason: string) {
  if (!reason) throw new UserError("A reason is required.");
  const settings = await getSettings();
  const vip = await prisma.vipStatus.findUnique({ where: { userId } });
  if (!vip || !["SUSPENDED", "EXPIRED", "NONE"].includes(vip.state)) throw new UserError("VIP status cannot be restored from its current state.");
  const now = new Date();
  const expiresAt = vip.expiresAt && vip.expiresAt > now ? vip.expiresAt : addMonths(now, settings.vip.durationMonths);
  await prisma.vipStatus.update({ where: { userId }, data: { state: "ACTIVE", since: vip.since ?? now, expiresAt, suspendedReason: null } });
  await record(userId, "RESTORED", { reason, actorId, expiresAt });
  await audit({ actorId, action: "vip.restore", entityType: "User", entityId: userId, summary: `Restored VIP until ${expiresAt.toISOString().slice(0, 10)}: ${reason}` });
  await notify(userId, { type: "vip", title: `${settings.vip.badgeName} restored`, body: `Your ${settings.vip.badgeName} status is active until ${expiresAt.toDateString()}.`, link: "/account/vip", event: "vip" });
}

export async function adminRevokeVip(userId: string, actorId: string, reason: string) {
  if (!reason) throw new UserError("A reason is required.");
  await prisma.vipStatus.update({ where: { userId }, data: { state: "NONE", expiresAt: null, suspendedReason: null } });
  await record(userId, "REVOKED", { reason, actorId });
  await audit({ actorId, action: "vip.revoke", entityType: "User", entityId: userId, summary: `Revoked VIP: ${reason}` });
}
