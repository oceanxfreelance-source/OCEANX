import { Flag, Heart, MapPin, MessageSquare, Phone, Store } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getSession, clientIpHash } from "@/lib/auth/session";
import { getSiteSettings } from "@/lib/site";
import { fileUrl } from "@/lib/storage";
import { formatMVR } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/dates";
import { CONDITIONS, recordListingView } from "@/lib/services/listings";
import { REPORT_REASONS } from "@/lib/services/reports";
import { isVipActiveRecord } from "@/lib/services/vip";
import { rateLimit } from "@/lib/rate-limit";
import { Gallery } from "@/components/Gallery";
import { JsonLd } from "@/components/JsonLd";
import { placeLabel } from "@/lib/place";
import { env } from "@/lib/env";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { LevelBadge, SoldBadge, StarsBadge, VipBadge, VerifiedBadge, StatusBadge } from "@/components/ui/badges";
import { contactSellerAction, reportAction, toggleSaveAction } from "@/app/actions/marketplace";

async function load(id: string) {
  return prisma.listing.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      category: true,
      subcategory: true,
      atoll: true,
      island: true,
      location: true,
      business: true,
      seller: { include: { vipStatus: true, sellerStats: { include: { level: true } }, profile: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const l = await prisma.listing.findUnique({
    where: { id },
    select: { title: true, price: true, status: true, description: true, island: { select: { name: true } }, images: { take: 1, orderBy: { sortOrder: "asc" }, select: { fileId: true } } },
  });
  if (!l || !["PUBLISHED", "SOLD"].includes(l.status)) return { title: "Listing", robots: { index: false, follow: false } };
  const title = `${l.title} — ${formatMVR(l.price)}${l.island ? ` in ${l.island.name}` : ""}`;
  const description = l.description.replace(/\s+/g, " ").slice(0, 155);
  const image = l.images[0] ? fileUrl(l.images[0].fileId)! : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/listing/${id}` },
    openGraph: { type: "website", title, description, url: `/listing/${id}`, images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [l, session, settings] = await Promise.all([load(id), getSession(), getSiteSettings()]);
  if (!l) notFound();
  const isOwner = session?.userId === l.sellerId;
  const isAdmin = !!session?.user.adminRole && session.mfaVerified;
  const publicVisible = ["PUBLISHED", "SOLD"].includes(l.status) && l.seller.status === "ACTIVE";
  if (!publicVisible && !isOwner && !isAdmin) notFound();

  if (publicVisible && !isOwner) {
    const ip = await clientIpHash();
    if (await rateLimit(`view:${id}:${session?.userId ?? ip}`, 1, 3600)) await recordListingView(id);
  }

  const saved = session ? !!(await prisma.savedListing.findUnique({ where: { userId_listingId: { userId: session.userId, listingId: id } } })) : false;
  const vip = isVipActiveRecord(l.seller.vipStatus) && settings.vip.enabled;
  const phone = l.showPhone ? l.contactPhone : null;
  const condition = CONDITIONS.find((c) => c.value === l.condition)?.label;
  const images = l.images.map((i) => fileUrl(i.fileId)!);
  const sold = l.status === "SOLD";

  const conditionSchema: Record<string, string> = { NEW: "NewCondition", LIKE_NEW: "UsedCondition", GOOD: "UsedCondition", FAIR: "UsedCondition", FOR_PARTS: "DamagedCondition" };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {publicVisible && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Product",
            name: l.title,
            description: l.description.slice(0, 500),
            image: images.map((u) => `${env.appUrl}${u}`),
            category: l.subcategory ? `${l.category.name} > ${l.subcategory.name}` : l.category.name,
            ...(conditionSchema[l.condition] ? { itemCondition: `https://schema.org/${conditionSchema[l.condition]}` } : {}),
            offers: {
              "@type": "Offer",
              price: (l.price / 100).toFixed(2),
              priceCurrency: "MVR",
              availability: sold ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
              url: `${env.appUrl}/listing/${l.id}`,
              areaServed: { "@type": "Place", name: `${placeLabel({ island: l.island, atoll: l.atoll })}${l.island || l.atoll ? ", Maldives" : ""}` },
              seller: { "@type": l.business ? "Organization" : "Person", name: l.business?.name ?? l.seller.name },
            },
          }}
        />
      )}
      <div className="space-y-4">
        {!publicVisible && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Only you can see this listing right now. Status: <StatusBadge status={l.status} />{" "}
            {isOwner && ["DRAFT", "PENDING_PAYMENT", "REJECTED"].includes(l.status) && (
              <Link href={`/sell/${l.id}/preview`} className="font-semibold underline">Continue publishing →</Link>
            )}
          </div>
        )}
        <Gallery images={images} title={l.title} />
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            {sold && <SoldBadge />}
            {vip && <VipBadge label={settings.vip.badgeName} />}
            <span className="chip bg-slate-100 text-slate-700">{condition}</span>
            <Link href={`/search?category=${l.category.slug}`} className="chip bg-ocean-50 text-ocean-800">{l.category.name}</Link>
            {l.subcategory && <Link href={`/search?category=${l.category.slug}&sub=${l.subcategory.slug}`} className="chip bg-ocean-50 text-ocean-800">{l.subcategory.name}</Link>}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{l.title}</h1>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ocean-800">
            {formatMVR(l.price, { free: "Free" })} {l.negotiable && <span className="text-sm font-medium text-slate-500">· Negotiable</span>}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            <MapPin className="mr-1 inline h-4 w-4 -translate-y-px text-slate-400" />{placeLabel(l)}
          </p>
          <p className="text-xs text-slate-500">
            {l.publishedAt ? `Posted ${timeAgo(l.publishedAt)}` : "Not yet published"} · {l.viewCount} views
            {sold && l.soldAt ? ` · Sold ${formatDate(l.soldAt)}` : ""}
          </p>
          <h2 className="mb-1 mt-4 font-semibold">Description</h2>
          <p className="whitespace-pre-line text-slate-700">{l.description}</p>
        </div>
      </div>

      <aside className="space-y-4">
        <div id="contact" className="card scroll-mt-24 p-4">
          <Link href={`/seller/${l.sellerId}`} className="flex items-center gap-3">
            {l.seller.profile?.avatarFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(l.seller.profile.avatarFileId)!} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-full bg-ocean-100 text-lg font-semibold text-ocean-800">{l.seller.name.charAt(0)}</span>
            )}
            <div>
              <p className="font-semibold">{l.seller.name}</p>
              <p className="text-xs text-slate-500">Member since {formatDate(l.seller.createdAt)}</p>
            </div>
          </Link>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {vip && <VipBadge label={settings.vip.badgeName} />}
            <StarsBadge stars={l.seller.sellerStats?.stars ?? 0} />
            <LevelBadge level={l.seller.sellerStats?.level} />
          </div>
          {l.business && (
            <Link href={`/business/${l.business.slug}`} className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <Store className="h-4 w-4 text-slate-500" /> {l.business.name} {l.business.verified && <VerifiedBadge />}
            </Link>
          )}

          {isOwner ? (
            <div className="mt-4 grid gap-2">
              <Link href="/account/listings" className="btn-primary">Manage my listings</Link>
            </div>
          ) : sold ? (
            <p className="mt-4 rounded-xl bg-slate-100 p-3 text-center text-sm font-medium">This item has been sold.</p>
          ) : (
            <div className="mt-4 grid gap-2">
              {phone && (
                <a href={`tel:${phone}`} className="btn-primary">
                  <Phone className="h-4 w-4" /> Call {phone.replace("+960", "")}
                </a>
              )}
              {l.contactWhatsapp && (
                <a href={`https://wa.me/${l.contactWhatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="btn bg-emerald-600 text-white hover:bg-emerald-700">
                  WhatsApp
                </a>
              )}
              {session ? (
                <ActionForm action={contactSellerAction}>
                  <input type="hidden" name="listingId" value={l.id} />
                  <textarea name="message" rows={2} className="input" defaultValue={`Hi, is "${l.title}" still available?`} maxLength={2000} aria-label="Message to seller" />
                  <SubmitButton className="btn-secondary w-full"><MessageSquare className="h-4 w-4" /> Message seller</SubmitButton>
                </ActionForm>
              ) : (
                <Link href={`/login?next=/listing/${l.id}`} className="btn-secondary"><MessageSquare className="h-4 w-4" /> Log in to message</Link>
              )}
            </div>
          )}
        </div>

        {!isOwner && publicVisible && (
          <form action={toggleSaveAction.bind(null, l.id)}>
            <button className="btn-secondary w-full"><Heart className={`h-4 w-4 ${saved ? "fill-coral-500 text-coral-500" : ""}`} /> {saved ? "Saved" : "Save item"}</button>
          </form>
        )}

        {!isOwner && publicVisible && session && (
          <details className="card p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-600"><Flag className="mr-1.5 inline h-3.5 w-3.5" />Report this listing</summary>
            <ActionForm action={reportAction} className="mt-3">
              <input type="hidden" name="listingId" value={l.id} />
              <select name="reason" className="input" required defaultValue="">
                <option value="" disabled>Choose a reason</option>
                {REPORT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <textarea name="details" rows={3} className="input" placeholder="Tell us more (optional)" maxLength={1000} />
              <SubmitButton className="btn-danger w-full">Send report</SubmitButton>
            </ActionForm>
          </details>
        )}
        <p className="px-1 text-xs text-slate-500">Safety tip: meet in a public place and never pay in advance for items you haven&apos;t seen.</p>
      </aside>

      {!isOwner && publicVisible && !sold && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-slate-500">{l.title}</p>
              <p className="text-sm font-semibold">{formatMVR(l.price, { free: "Free" })}</p>
            </div>
            {phone && (
              <a href={`tel:${phone}`} className="btn-secondary btn-sm h-10 px-3" aria-label="Call seller">
                <Phone className="h-4 w-4" /> Call
              </a>
            )}
            <a href="#contact" className="btn-accent btn-sm h-10 px-3">
              <MessageSquare className="h-4 w-4" /> Message
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
