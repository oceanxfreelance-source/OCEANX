import Link from "next/link";
import { ArrowRight, BadgePercent, Crown, Search, ShieldCheck, Star } from "lucide-react";
import { prisma } from "@/lib/db";
import { getActiveCategories, getSiteSettings } from "@/lib/site";
import { listingCardSelect } from "@/lib/services/listings";
import { ListingGrid, EmptyState } from "@/components/ListingCard";
import { CategoryIcon } from "@/components/icons";
import { fileUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

function SectionHeader({ title, href, action }: { title: string; href?: string; action?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-ocean-700 hover:text-ocean-800">
          {action} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

export default async function HomePage() {
  const settings = await getSiteSettings();
  const now = new Date();
  const [categories, banners, featured, recent, atollCount, islandCount] = await Promise.all([
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
    prisma.atoll.count({ where: { isActive: true } }),
    prisma.island.count({ where: { isActive: true } }),
  ]);

  return (
    <div className="space-y-12">
      {settings.homepage.announcement && (
        <div className="rounded-lg border border-ocean-200 bg-ocean-50 px-4 py-2.5 text-sm text-ocean-900">{settings.homepage.announcement}</div>
      )}

      <section className="bg-grid relative -mx-4 -mt-4 overflow-hidden sm:mt-0 bg-slate-950 px-4 py-12 text-white sm:mx-0 sm:rounded-2xl sm:px-10 sm:py-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-ocean-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-ocean-400/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <p className="eyebrow text-ocean-300">The Maldives marketplace</p>
          <h1 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">{settings.homepage.heroTitle}</h1>
          <p className="mt-4 max-w-xl text-base text-slate-300 sm:text-lg">{settings.homepage.heroSubtitle}</p>
          <form action="/search" className="mt-8 flex max-w-xl gap-2 rounded-xl bg-white p-1.5 shadow-xl shadow-black/20" role="search">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input name="q" type="search" placeholder="What are you looking for?" className="h-11 w-full rounded-lg bg-transparent pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none sm:text-sm" aria-label="Search listings" />
            </div>
            <button className="btn-accent">Search</button>
          </form>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
            <Link href="/sell" className="inline-flex items-center gap-1.5 font-medium text-white hover:text-ocean-200">
              Post a listing <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="hidden h-4 w-px bg-white/15 sm:block" />
            <span>No commission on sales</span>
          </div>
        </div>
        <dl className="relative mt-12 grid max-w-2xl grid-cols-3 gap-6 border-t border-white/10 pt-6">
          {[
            [String(atollCount), "Atolls"],
            [String(islandCount), "Islands covered"],
            ["0%", "Commission"],
          ].map(([v, k]) => (
            <div key={k}>
              <dt className="text-xs text-slate-400">{k}</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {settings.homepage.showCategories && (
        <section>
          <SectionHeader title="Browse by category" href="/categories" action="All categories" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {categories.map((c) => (
              <Link key={c.id} href={`/search?category=${c.slug}`} className="group flex flex-col items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-2 py-4 text-center transition hover:border-ocean-300 hover:shadow-sm">
                {c.imageFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(c.imageFileId)!} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-ocean-50 group-hover:text-ocean-700">
                    <CategoryIcon slug={c.slug} />
                  </span>
                )}
                <span className="text-xs font-medium leading-tight text-slate-700">{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {banners.length > 0 && (
        <section className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4">
          {banners.map((b) => {
            const inner = (
              <div className="relative flex h-36 w-[85vw] max-w-md shrink-0 snap-start items-end overflow-hidden rounded-xl p-5 text-white" style={{ background: b.background }}>
                {b.imageFileId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(b.imageFileId)!} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="relative">
                  <p className="text-lg font-semibold tracking-tight">{b.title}</p>
                  {b.subtitle && <p className="mt-0.5 text-sm text-white/85">{b.subtitle}</p>}
                </div>
              </div>
            );
            return b.linkUrl && b.linkUrl.startsWith("/") ? (
              <Link key={b.id} href={b.linkUrl}>{inner}</Link>
            ) : (
              <div key={b.id}>{inner}</div>
            );
          })}
        </section>
      )}

      {featured.length > 0 && (
        <section>
          <SectionHeader title="Featured" />
          <ListingGrid items={featured} vipLabel={settings.vip.badgeName} />
        </section>
      )}

      <section>
        <SectionHeader title="Latest listings" href="/search" action="View all" />
        {recent.length ? (
          <ListingGrid items={recent} vipLabel={settings.vip.badgeName} />
        ) : (
          <EmptyState title="No listings yet">
            Be the first to <Link href="/sell" className="font-medium text-ocean-700 underline">post a listing</Link>.
          </EmptyState>
        )}
      </section>

      <section className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { Icon: BadgePercent, t: "No commission", d: "Keep 100% of your sale price. No subscriptions for individual sellers." },
          { Icon: ShieldCheck, t: "Verified payments", d: "Every posting fee is checked before a listing goes live." },
          { Icon: Star, t: "Reputation that counts", d: "Stars come only from genuine, buyer-confirmed sales." },
          { Icon: Crown, t: `${settings.vip.badgeName} sellers`, d: "Top sellers enjoy reduced fees and share in monthly rewards." },
        ].map(({ Icon, t, d }) => (
          <div key={t} className="bg-white p-5">
            <Icon className="h-5 w-5 text-ocean-600" strokeWidth={1.75} />
            <p className="mt-3 font-medium text-slate-900">{t}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{d}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:p-8">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Have something to sell?</h2>
          <p className="mt-1 text-sm text-slate-500">List it in minutes and reach buyers on every atoll.</p>
        </div>
        <Link href="/sell" className="btn-primary">Post a listing <ArrowRight className="h-4 w-4" /></Link>
      </section>
    </div>
  );
}
