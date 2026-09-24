import Link from "next/link";
import { AlertCircle, Bookmark, ChevronRight, Crown, FileClock, Heart, LayoutList, MessageSquare, Plus, Receipt, Settings, ShoppingBag } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { getSiteSettings } from "@/lib/site";
import { recomputeSellerStats } from "@/lib/services/reputation";
import { isVipActiveRecord } from "@/lib/services/vip";
import { unreadMessageCount } from "@/lib/services/messaging";
import { formatDate } from "@/lib/dates";
import { LevelBadge, StarsBadge, VipBadge } from "@/components/ui/badges";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const settings = await getSiteSettings();
  const stats = await recomputeSellerStats(user.id);
  const [level, vip, pendingConfirm, unpaidFines, drafts, unread, saved] = await Promise.all([
    stats.levelId ? prisma.sellerLevel.findUnique({ where: { id: stats.levelId } }) : null,
    prisma.vipStatus.findUnique({ where: { userId: user.id } }),
    prisma.successfulDeal.count({ where: { buyerId: user.id, status: "PENDING_CONFIRMATION" } }),
    prisma.cancellationFine.count({ where: { status: "UNPAID", cancellation: { sellerId: user.id } } }),
    prisma.listing.count({ where: { sellerId: user.id, status: { in: ["DRAFT", "PENDING_PAYMENT", "REJECTED"] } } }),
    unreadMessageCount(user.id),
    prisma.savedListing.count({ where: { userId: user.id } }),
  ]);
  const vipActive = isVipActiveRecord(vip) && settings.vip.enabled;

  const alerts = [
    pendingConfirm > 0 && { href: "/account/purchases", Icon: ShoppingBag, text: `${pendingConfirm} purchase${pendingConfirm > 1 ? "s" : ""} waiting for your confirmation`, tone: "border-amber-200 bg-amber-50 text-amber-900" },
    unpaidFines > 0 && { href: "/account/cancellations", Icon: AlertCircle, text: "You have an unpaid cancellation fee", tone: "border-red-200 bg-red-50 text-red-800" },
    drafts > 0 && { href: "/account/listings?tab=drafts", Icon: FileClock, text: `${drafts} listing${drafts > 1 ? "s" : ""} not published yet — finish posting`, tone: "border-sky-200 bg-sky-50 text-sky-900" },
  ].filter(Boolean) as { href: string; Icon: typeof AlertCircle; text: string; tone: string }[];

  const tiles = [
    { href: "/account/listings", Icon: LayoutList, label: "My listings", sub: `${stats.activeListings} live` },
    { href: "/messages", Icon: MessageSquare, label: "Messages", sub: unread ? `${unread} unread` : "All caught up" },
    { href: "/account/saved", Icon: Heart, label: "Saved", sub: `${saved} item${saved === 1 ? "" : "s"}` },
    { href: "/account/vip", Icon: Crown, label: `Stars & ${settings.vip.badgeName}`, sub: `${stats.stars} Stars` },
    { href: "/account/payments", Icon: Receipt, label: "Payments", sub: "History & status" },
    { href: "/account/settings", Icon: Settings, label: "Settings", sub: "Profile & password" },
  ];

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-lg font-semibold text-white">{user.name.charAt(0).toUpperCase()}</span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Hi, {user.name.split(" ")[0]}</h1>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {vipActive && <VipBadge label={settings.vip.badgeName} />}
              <StarsBadge stars={stats.stars} />
              <LevelBadge level={level} />
            </div>
            {vipActive && vip?.expiresAt && <p className="mt-1.5 text-xs text-slate-500">{settings.vip.badgeName} until {formatDate(vip.expiresAt)}</p>}
          </div>
        </div>
        <Link href="/sell" className="btn-accent">
          <Plus className="h-4 w-4" strokeWidth={2.25} /> Post a listing
        </Link>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(({ href, Icon, text, tone }) => (
            <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${tone}`}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{text}</span>
              <ChevronRight className="h-4 w-4 opacity-60" />
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map(({ href, Icon, label, sub }) => (
          <Link key={href} href={href} className="card group flex items-center gap-3 p-4 transition hover:border-line-strong hover:shadow-md hover:shadow-slate-900/5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700 transition group-hover:bg-ocean-50 group-hover:text-ocean-700">
              <Icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-900">{label}</span>
              <span className="block truncate text-xs text-slate-500">{sub}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="card grid grid-cols-2 divide-slate-100 sm:grid-cols-4 sm:divide-x">
        {[
          ["Live listings", stats.activeListings],
          ["Items sold", stats.soldListings],
          ["Successful deals", stats.countedDeals],
          ["Stars", stats.stars],
        ].map(([k, v]) => (
          <div key={k} className="p-4">
            <p className="text-xs text-slate-500">{k}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{v}</p>
          </div>
        ))}
      </div>

      <Link href="/account/business" className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-slate-600 hover:border-slate-400 hover:text-slate-900">
        <span className="flex items-center gap-2"><Bookmark className="h-4 w-4" /> Run a shop? Set up a business storefront</span>
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
