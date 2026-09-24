import { prisma } from "../db";
import { getSettings } from "../settings";
import { notify } from "../notify";
import { recomputeSellerStats } from "./reputation";

/**
 * A referral becomes VERIFIED only when the referred person is a genuine, active user:
 * verified email, and (if configured) at least one paid, published listing.
 * Referrals flagged as same-network are left for admin review instead of auto-verifying.
 */
export async function evaluateReferral(referredUserId: string) {
  const referral = await prisma.referral.findUnique({ where: { referredId: referredUserId } });
  if (!referral || referral.status !== "PENDING" || referral.reason) return;
  const settings = await getSettings();
  const user = await prisma.user.findUnique({ where: { id: referredUserId } });
  if (!user?.emailVerifiedAt || user.status !== "ACTIVE") return;
  if (settings.referrals.requireReferredPublishedListing) {
    const published = await prisma.listing.count({ where: { sellerId: referredUserId, publishedAt: { not: null } } });
    if (published === 0) return;
  }
  await prisma.referral.update({ where: { id: referral.id }, data: { status: "VERIFIED", verifiedAt: new Date() } });
  await recomputeSellerStats(referral.referrerId);
  if (settings.referrals.enabled) {
    await notify(referral.referrerId, {
      type: "referral",
      title: "Referral verified",
      body: `${user.name} joined MV Markets with your referral code and is now an active member.`,
      link: "/account/referrals",
    });
  }
}

export async function adminSetReferralStatus(referralId: string, status: "VERIFIED" | "REJECTED", reason: string) {
  const r = await prisma.referral.update({
    where: { id: referralId },
    data: { status, reason, verifiedAt: status === "VERIFIED" ? new Date() : null },
  });
  await recomputeSellerStats(r.referrerId);
  return r;
}
