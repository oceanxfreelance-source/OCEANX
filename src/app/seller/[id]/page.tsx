import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSiteSettings } from "@/lib/site";
import { listingCardSelect } from "@/lib/services/listings";
import { isVipActiveRecord } from "@/lib/services/vip";
import { fileUrl } from "@/lib/storage";
import { formatDate } from "@/lib/dates";
import { ListingGrid, EmptyState } from "@/components/ListingCard";
import { LevelBadge, StarsBadge, VipBadge } from "@/components/ui/badges";

export default async function SellerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const [seller, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id }, include: { profile: { include: { island: true, atoll: true } }, vipStatus: true, sellerStats: { include: { level: true } } } }),
    getSiteSettings(),
  ]);
  if (!seller || seller.status !== "ACTIVE") notFound();
  const showSold = tab === "sold";
  const listings = await prisma.listing.findMany({ where: { sellerId: id, status: showSold ? "SOLD" : "PUBLISHED" }, orderBy: showSold ? { soldAt: "desc" } : { publishedAt: "desc" }, take: 60, select: listingCardSelect });
  const vip = isVipActiveRecord(seller.vipStatus) && settings.vip.enabled;
  const stats = seller.sellerStats;
  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        {seller.profile?.avatarFileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(seller.profile.avatarFileId)!} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <span className="grid h-20 w-20 place-items-center rounded-full bg-ocean-100 text-3xl font-bold text-ocean-800">{seller.name.charAt(0)}</span>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{seller.profile?.displayName || seller.name}</h1>
          <p className="text-sm text-slate-500">
            Member since {formatDate(seller.createdAt)}
            {seller.profile?.island ? ` · ${seller.profile.island.name}, ${seller.profile.atoll?.code ?? ""}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {vip && <VipBadge label={settings.vip.badgeName} size="md" />}
            <StarsBadge stars={stats?.stars ?? 0} />
            <LevelBadge level={stats?.level} />
          </div>
          {seller.profile?.bio && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{seller.profile.bio}</p>}
        </div>
        <dl className="grid grid-cols-3 gap-3 text-center">
          <div><dt className="text-xs text-slate-500">Live</dt><dd className="text-lg font-bold">{stats?.activeListings ?? 0}</dd></div>
          <div><dt className="text-xs text-slate-500">Sold</dt><dd className="text-lg font-bold">{stats?.soldListings ?? 0}</dd></div>
          <div><dt className="text-xs text-slate-500">Deals</dt><dd className="text-lg font-bold">{stats?.countedDeals ?? 0}</dd></div>
        </dl>
      </div>
      <div className="flex gap-2">
        <Link href={`/seller/${id}`} className={!showSold ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Available</Link>
        <Link href={`/seller/${id}?tab=sold`} className={showSold ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Sold</Link>
      </div>
      {listings.length ? <ListingGrid items={listings} vipLabel={settings.vip.badgeName} /> : <EmptyState title={showSold ? "No sold items yet" : "No live listings right now"} />}
    </div>
  );
}
