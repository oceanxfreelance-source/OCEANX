import { prisma } from "../db";
import { autoDrawIfDue } from "./giveaways";
import { purgeExpiredRateLimits } from "../rate-limit";
import { daysAgo } from "../dates";
import { runVipMaintenance } from "./vip";
import { autoConfirmDeals } from "./deals";
import { expireSubscriptions } from "./business";

/** Runs all scheduled housekeeping. Triggered daily by Vercel Cron (see vercel.json). */
export async function runDailyMaintenance() {
  const now = new Date();
  const autoConfirmed = await autoConfirmDeals(now);
  const subscriptionsExpired = await expireSubscriptions(now);
  const vip = await runVipMaintenance(now);
  // Giveaways past their end time are drawn automatically (normally the live view already did it at the end time).
  const dueGiveaways = await prisma.giveaway.findMany({ where: { status: { in: ["ACTIVE", "ENDED"] }, endsAt: { lt: now } }, select: { id: true } });
  for (const g of dueGiveaways) await autoDrawIfDue(g.id, now);
  await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.otpCode.deleteMany({ where: { createdAt: { lt: daysAgo(7, now) } } });
  await purgeExpiredRateLimits();
  return { autoConfirmed, subscriptionsExpired, vipEvaluated: vip.evaluated };
}
