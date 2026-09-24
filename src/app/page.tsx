import Link from "next/link";
import { prisma } from "@/lib/db";
import { getActiveCategories, getSiteSettings } from "@/lib/site";
import { listingCardSelect } from "@/lib/services/listings";
import { ListingGrid, EmptyState } from "@/components/ListingCard";
import { fileUrl } from "@/lib/storage";
import { formatMVR } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const settings = await getSiteSettings();
  const now = new Date();
  const [categories, banners, featured, recent] = await Promise.all([
    getActiveCategories(),
    prisma.banner.findMany({
      where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
      orderBy: { sortOrder: "asc" },
      take: 5,
    }),
    settings.homepage.showFeatured
      ? prisma.listing.findMany({ where: { status: "PUBLISHED", featuredUntil: { gt: now }, seller: { status: "ACTIVE" } }, orderBy: { featuredUntil: "desc" }, take: 8, select: listingCardSelect })
      : [],
    prisma.listing.findMany({ where: { status: "PUBLISHED", seller: { status: "ACTIVE" } }, orderBy: { publishedAt: "desc" }, take: settings.homepage.recentCount, select: listingCardSelect }),
  ]);

  return (
    <div className="space-y-8">
      {settings.homepage.announcement && <div className="rounded-xl bg-ocean-50 px-4 py-2 text-sm text-ocean-900 ring-1 ring-ocean-100">📣 {settings.homepage.announcement}</div>}

      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-ocean-600 via-ocean-700 to-ocean-900 px-5 py-8 text-white shadow-lg sm:px-10 sm:py-12">
        <h1 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">{settings.homepage.heroTitle}</h1>
        <p className="mt-3 max-w-xl text-ocean-100">{settings.homepage.heroSubtitle}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/sell" className="btn-accent">
            Start selling — {formatMVR(settings.fees.postingFee)}
          </Link>
          <Link href="/search" className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25">
            Browse listings
          </Link>
        </div>
        <p className="mt-4 text-xs text-ocean-100">No commission on your sale. {settings.vip.badgeName} sellers pay only {formatMVR(settings.fees.vipPostingFee)}.</p>
      </section>

      {banners.length > 0 && (
        <section className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4">
          {banners.map((b) => {
            const inner = (
              <div className="relative flex h-32 w-[85vw] max-w-md shrink-0 snap-start items-end overflow-hidden rounded-2xl p-4 text-white shadow sm:h-36" style={{ background: b.background }}>
                {b.imageFileId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(b.imageFileId)!} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
                )}
                <div className="relative">
                  <p className="text-lg font-bold">{b.title}</p>
                  {b.subtitle && <p className="text-sm opacity-90">{b.subtitle}</p>}
                </div>
              </div>
            );
            return b.linkUrl && b.linkUrl.startsWith("/") ? (
              <Link key={b.id} href={b.linkUrl}>
                {inner}
              </Link>
            ) : (
              <div key={b.id}>{inner}</div>
            );
          })}
        </section>
      )}

      {settings.homepage.showCategories && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Categories</h2>
            <Link href="/categories" className="text-sm text-ocean-700">
              See all
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {categories.map((c) => (
              <Link key={c.id} href={`/search?category=${c.slug}`} className="card flex flex-col items-center gap-1 p-2 text-center hover:border-ocean-300">
                {c.imageFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(c.imageFileId)!} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <span className="text-2xl">{c.icon ?? "📦"}</span>
                )}
                <span className="text-[11px] font-medium leading-tight text-slate-700">{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Featured</h2>
          <ListingGrid items={featured} vipLabel={settings.vip.badgeName} />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Fresh listings</h2>
          <Link href="/search" className="text-sm text-ocean-700">
            View all
          </Link>
        </div>
        {recent.length ? (
          <ListingGrid items={recent} vipLabel={settings.vip.badgeName} />
        ) : (
          <EmptyState title="No listings yet">
            Be the first to <Link href="/sell" className="text-ocean-700 underline">sell something</Link>.
          </EmptyState>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["💸", "Small one-time fee", `${formatMVR(settings.fees.postingFee)} per listing. No monthly fees, no commission.`],
          ["⭐", "Earn Stars", "Every genuine completed sale builds your reputation and seller level."],
          ["👑", `Become ${settings.vip.badgeName}`, `Top active sellers pay ${formatMVR(settings.fees.vipPostingFee)} and share in monthly rewards.`],
        ].map(([icon, t, d]) => (
          <div key={t} className="card p-4">
            <p className="text-2xl">{icon}</p>
            <p className="mt-1 font-semibold">{t}</p>
            <p className="text-sm text-slate-600">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
