import { prisma } from "../db";
import { getSettings, type Settings } from "../settings";
import { isVipActiveRecord } from "./vip";

export type FeeQuote = {
  amount: number;
  isVipRate: boolean;
  normalFee: number;
  vipFee: number;
  waivedReason: string | null;
  discountPercent: number;
};

/** Active business subscription (if any) for a business owned by this user. */
export async function activeSubscription(businessId: string, now = new Date()) {
  return prisma.businessSubscription.findFirst({
    where: { businessId, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } },
    include: { plan: true },
    orderBy: { endsAt: "desc" },
  });
}

/**
 * The posting fee is always derived from admin settings and the seller's CURRENT VIP status.
 * Business plans may include a number of fee-free listings per subscription period.
 */
export async function quotePostingFee(userId: string, opts: { businessId?: string | null; settings?: Settings; excludeListingId?: string } = {}): Promise<FeeQuote> {
  const settings = opts.settings ?? (await getSettings());
  const normalFee = settings.fees.postingFee;
  const vipFee = settings.fees.vipPostingFee;
  const discountPercent = normalFee > 0 ? Math.round(((normalFee - vipFee) / normalFee) * 100) : 0;

  if (opts.businessId) {
    const sub = await activeSubscription(opts.businessId);
    if (sub && sub.plan.freeListingsPerPeriod > 0) {
      const used = await prisma.listing.count({
        where: {
          businessId: opts.businessId,
          feeWaivedReason: "business_plan",
          submittedAt: { gte: sub.startsAt! },
          ...(opts.excludeListingId ? { NOT: { id: opts.excludeListingId } } : {}),
        },
      });
      if (used < sub.plan.freeListingsPerPeriod) {
        return { amount: 0, isVipRate: false, normalFee, vipFee, waivedReason: "business_plan", discountPercent };
      }
    }
  }

  const vip = settings.vip.enabled ? await prisma.vipStatus.findUnique({ where: { userId } }) : null;
  const isVip = settings.vip.enabled && isVipActiveRecord(vip);
  const amount = isVip ? vipFee : normalFee;
  return { amount, isVipRate: isVip, normalFee, vipFee, waivedReason: amount === 0 ? "free_posting" : null, discountPercent };
}
