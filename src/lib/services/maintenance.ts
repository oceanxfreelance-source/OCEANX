import { prisma } from "../db";
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
  await prisma.giveaway.updateMany({ where: { status: "ACTIVE", endsAt: { lt: now } }, data: { status: "ENDED" } });
  await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.otpCode.deleteMany({ where: { createdAt: { lt: daysAgo(7, now) } } });
  await purgeExpiredRateLimits();
  return { autoConfirmed, subscriptionsExpired, vipEvaluated: vip.evaluated };
}
