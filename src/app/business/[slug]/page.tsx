import type { Metadata } from "next";
import { Phone, Store } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSiteSettings } from "@/lib/site";
import { listingCardSelect } from "@/lib/services/listings";
import { activeSubscription } from "@/lib/services/fees";
import { fileUrl } from "@/lib/storage";
import { ListingGrid, EmptyState } from "@/components/ListingCard";
import { VerifiedBadge } from "@/components/ui/badges";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = await prisma.business.findUnique({ where: { slug }, select: { name: true, description: true, status: true } });
  if (!b || b.status !== "ACTIVE") return { robots: { index: false } };
  return { title: `${b.name} — shop on MV Markets`, description: b.description?.slice(0, 155) || undefined, alternates: { canonical: `/business/${slug}` } };
}

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [biz, settings] = await Promise.all([prisma.business.findUnique({ where: { slug }, include: { island: { include: { atoll: true } }, owner: { select: { status: true } } } }), getSiteSettings()]);
  if (!biz || biz.status !== "ACTIVE" || biz.owner.status !== "ACTIVE" || !settings.business.enabled) notFound();
  const sub = await activeSubscription(biz.id);
  const storefront = !!sub && (!settings.business.requireVerifiedForStorefront || biz.verified);
  const listings = await prisma.listing.findMany({ where: { businessId: biz.id, status: "PUBLISHED" }, orderBy: [{ featuredUntil: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }], take: 96, select: listingCardSelect });
  const color = (storefront && biz.brandColor) || "#0e7490";
  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        <div className="relative h-32 sm:h-44" style={{ background: color }}>
          {storefront && biz.bannerFileId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(biz.bannerFileId)!} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
          <div className="-mt-14 h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-white shadow">
            {biz.logoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(biz.logoFileId)!} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full place-items-center text-slate-400"><Store className="h-8 w-8" strokeWidth={1.5} /></span>
            )}
          </div>
          <div className="flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {biz.name} {biz.verified && <VerifiedBadge />}
            </h1>
            <p className="text-sm text-slate-500">{[biz.address, biz.island ? `${biz.island.name}, ${biz.island.atoll.code}` : null].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {biz.phone && <a href={`tel:${biz.phone}`} className="btn-primary btn-sm"><Phone className="h-3.5 w-3.5" /> Call</a>}
            {biz.website && <a href={biz.website} target="_blank" rel="noopener noreferrer nofollow" className="btn-secondary btn-sm">Website</a>}
            {biz.email && <a href={`mailto:${biz.email}`} className="btn-secondary btn-sm">Email</a>}
          </div>
        </div>
        {biz.description && <p className="whitespace-pre-line px-5 pb-5 text-sm text-slate-700">{biz.description}</p>}
      </div>
      {listings.length ? <ListingGrid items={listings} vipLabel={settings.vip.badgeName} /> : <EmptyState title="No live listings right now" />}
    </div>
  );
}
