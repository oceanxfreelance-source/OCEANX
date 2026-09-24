import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { getSiteSettings } from "@/lib/site";
import { quotePostingFee } from "@/lib/services/fees";
import { recomputeSellerStats } from "@/lib/services/reputation";
import { isVipActiveRecord } from "@/lib/services/vip";
import { formatMVR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { LevelBadge, StarsBadge, VipBadge } from "@/components/ui/badges";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const settings = await getSiteSettings();
  const stats = await recomputeSellerStats(user.id);
  const [level, quote, vip, pendingConfirm, unpaidFines, drafts] = await Promise.all([
    stats.levelId ? prisma.sellerLevel.findUnique({ where: { id: stats.levelId } }) : null,
    quotePostingFee(user.id),
    prisma.vipStatus.findUnique({ where: { userId: user.id } }),
    prisma.successfulDeal.count({ where: { buyerId: user.id, status: "PENDING_CONFIRMATION" } }),
    prisma.cancellationFine.count({ where: { status: "UNPAID", cancellation: { sellerId: user.id } } }),
    prisma.listing.count({ where: { sellerId: user.id, status: { in: ["DRAFT", "PENDING_PAYMENT", "REJECTED"] } } }),
  ]);
  const vipActive = isVipActiveRecord(vip) && settings.vip.enabled;
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="text-sm text-slate-500">Welcome back,</p>
        <h1 className="text-2xl font-bold">{user.name}</h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {vipActive && <VipBadge label={settings.vip.badgeName} size="md" />}
          <StarsBadge stars={stats.stars} />
          <LevelBadge level={level} />
        </div>
        {vipActive && vip?.expiresAt && <p className="mt-2 text-sm text-amber-800">{settings.vip.badgeName} until {formatDate(vip.expiresAt)}</p>}
      </div>

      {(pendingConfirm > 0 || unpaidFines > 0 || drafts > 0) && (
        <div className="space-y-2">
          {pendingConfirm > 0 && <Link href="/account/purchases" className="block rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">🧾 {pendingConfirm} purchase(s) waiting for your confirmation →</Link>}
          {unpaidFines > 0 && <Link href="/account/cancellations" className="block rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">⚠️ You have an unpaid cancellation fee →</Link>}
          {drafts > 0 && <Link href="/account/listings?tab=drafts" className="block rounded-xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">📝 {drafts} listing(s) not yet published →</Link>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Live listings", stats.activeListings],
          ["Sold", stats.soldListings],
          ["Successful deals", stats.countedDeals],
          ["Stars", stats.stars],
        ].map(([k, v]) => (
          <div key={k} className="card p-4">
            <p className="text-xs text-slate-500">{k}</p>
            <p className="text-2xl font-bold">{v}</p>
          </div>
        ))}
      </div>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">Your posting fee</p>
          <p className="text-xl font-bold">
            {quote.isVipRate ? `★ ${settings.vip.badgeName} posting fee: ${formatMVR(quote.amount)}` : `Normal posting fee: ${formatMVR(quote.amount)}`}
          </p>
        </div>
        <Link href="/sell" className="btn-accent">+ Sell an item</Link>
      </div>
    </div>
  );
}
