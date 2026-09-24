import Link from "next/link";
import { ArrowRight, BadgePercent, Crown, ShieldCheck, Star, Target } from "lucide-react";
import { BannerCarousel } from "@/components/BannerCarousel";
import { GiveawayPromo } from "@/components/GiveawayPromo";
import { prisma } from "@/lib/db";
import { getActiveCategories, getSiteSettings } from "@/lib/site";
import { listingCardSelect } from "@/lib/services/listings";
import { ListingGrid, EmptyState } from "@/components/ListingCard";
import { CategoryIcon } from "@/components/icons";
import { fileUrl } from "@/lib/storage";
import { env } from "@/lib/env";
import { JsonLd } from "@/components/JsonLd";

export const dynamic = "force-dynamic";
export const metadata = { alternates: { canonical: "/" } };

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
  const [categories, banners, featured, recent, totalListings, giveaways] = await Promise.all([
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
    prisma.listing.count({ where: { status: "PUBLISHED", seller: { status: "ACTIVE" } } }),
    prisma.giveaway.findMany({ where: { status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { endsAt: "asc" }, select: { id: true, title: true, prize: true, endsAt: true, imageFileId: true } }),
  ]);

  return (
    <div className="space-y-8 sm:space-y-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              name: settings.general.marketplaceName,
              alternateName: ["MV Markets", "MVMarkets", "mvmarkets", "MV Markets Maldives", `${settings.general.marketplaceName} ${settings.general.tagline}`],
              url: env.appUrl,
              potentialAction: { "@type": "SearchAction", target: `${env.appUrl}/search?q={search_term_string}`, "query-input": "required name=search_term_string" },
            },
            { "@type": "Organization", name: `${settings.general.marketplaceName} ${settings.general.tagline}`, url: env.appUrl, logo: `${env.appUrl}/icon.svg`, areaServed: "MV" },
          ],
        }}
      />

      {giveaways.length > 0 && (
        <GiveawayPromo
          g={{ id: giveaways[0].id, title: giveaways[0].title, prize: giveaways[0].prize, endsAt: giveaways[0].endsAt.toISOString(), image: giveaways[0].imageFileId ? fileUrl(giveaways[0].imageFileId) : null }}
          more={giveaways.length - 1}
        />
      )}

      {settings.homepage.announcement && (
        <div className="rounded-lg border border-ocean-200 bg-ocean-50 px-4 py-2.5 text-sm text-ocean-900">{settings.homepage.announcement}</div>
      )}
      {banners.length > 0 && <h1 className="sr-only">{settings.general.marketplaceName} — {settings.homepage.heroTitle}</h1>}
      {banners.length > 0 ? (
        <BannerCarousel
          slides={banners.map((b) => ({
            id: b.id,
            title: b.title,
            subtitle: b.subtitle,
            background: b.background,
            image: b.imageFileId ? fileUrl(b.imageFileId) : null,
            href: b.linkUrl && b.linkUrl.startsWith("/") ? b.linkUrl : null,
          }))}
        />
      ) : (
        <section className="bg-grid relative -mx-4 -mt-4 overflow-hidden bg-slate-950 px-4 py-8 text-white sm:mx-0 sm:mt-0 sm:rounded-2xl sm:px-10 sm:py-14">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-ocean-500/25 blur-3xl" />
          <div className="relative max-w-2xl">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-5xl">{settings.homepage.heroTitle}</h1>
            <p className="mt-2 text-sm text-slate-300 sm:mt-4 sm:text-lg">{settings.homepage.heroSubtitle}</p>
            <Link href="/sell" className="btn-accent mt-5">Post a listing <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>
      )}

      <section>
        <SectionHeader title="Latest items" href="/search" action="View all" />
        {recent.length ? (
          <>
            <ListingGrid items={recent} vipLabel={settings.vip.badgeName} />
            <Link href="/search" className="btn-secondary mt-5 w-full">
              See all listings{totalListings > recent.length ? ` (${totalListings.toLocaleString()})` : ""} <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <EmptyState title="No listings yet">
            Be the first to <Link href="/sell" className="font-medium text-ocean-700 underline">post a listing</Link>.
          </EmptyState>
        )}
      </section>

      {featured.length > 0 && (
        <section>
          <SectionHeader title="Featured" />
          <ListingGrid items={featured} vipLabel={settings.vip.badgeName} />
        </section>
      )}

      {settings.homepage.showCategories && (
        <section>
          <SectionHeader title="Browse by category" href="/categories" action="All" />
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 lg:grid-cols-7">
            {categories.map((c) => (
              <Link key={c.id} href={`/search?category=${c.slug}`} className="group flex w-24 shrink-0 flex-col items-center gap-2 rounded-xl border border-slate-200/80 bg-surface px-2 py-3 text-center transition hover:border-ocean-300 hover:shadow-sm sm:w-auto sm:py-4">
                {c.imageFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(c.imageFileId)!} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-ocean-50 group-hover:text-ocean-700">
                    <CategoryIcon slug={c.slug} />
                  </span>
                )}
                <span className="line-clamp-2 text-xs font-medium leading-tight text-slate-700">{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {settings.homepage.showAbout && (settings.homepage.aboutText || settings.homepage.aboutAim) && (
        <section id="about" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200/80 bg-surface">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_1fr]">
            <div className="p-6 sm:p-10">
              <p className="eyebrow text-ocean-700">About us</p>
              {settings.homepage.aboutTitle && <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{settings.homepage.aboutTitle}</h2>}
              {settings.homepage.aboutText && <p className="mt-4 whitespace-pre-line leading-relaxed text-slate-600">{settings.homepage.aboutText}</p>}
            </div>
            {settings.homepage.aboutAim && (
              <div className="bg-grid relative bg-slate-950 p-6 text-white sm:p-10">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-ocean-500/25 blur-3xl" />
                <div className="relative">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/10 text-ocean-200">
                    <Target className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <p className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-ocean-200">Our aim</p>
                  <p className="mt-2 whitespace-pre-line leading-relaxed text-white/85">{settings.homepage.aboutAim}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="hidden gap-px overflow-hidden sm:grid rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { Icon: BadgePercent, t: "No commission", d: "Keep 100% of your sale price. No subscriptions for individual sellers." },
          { Icon: ShieldCheck, t: "Verified payments", d: "Every posting fee is checked before a listing goes live." },
          { Icon: Star, t: "Reputation that counts", d: "Stars come only from genuine, buyer-confirmed sales." },
          { Icon: Crown, t: `${settings.vip.badgeName} sellers`, d: "Top sellers enjoy reduced fees and share in monthly rewards." },
        ].map(({ Icon, t, d }) => (
          <div key={t} className="bg-surface p-5">
            <Icon className="h-5 w-5 text-ocean-600" strokeWidth={1.75} />
            <p className="mt-3 font-medium text-slate-900">{t}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{d}</p>
          </div>
        ))}
      </section>

      <section className="hidden flex-col items-start justify-between gap-4 rounded-2xl sm:flex border border-slate-200 bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Have something to sell?</h2>
          <p className="mt-1 text-sm text-slate-500">List it in minutes and reach buyers on every atoll.</p>
        </div>
        <Link href="/sell" className="btn-primary">Post a listing <ArrowRight className="h-4 w-4" /></Link>
      </section>
    </div>
  );
}
