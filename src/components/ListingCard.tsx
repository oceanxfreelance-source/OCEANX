import Link from "next/link";
import type { ListingCardData } from "@/lib/services/listings";
import { formatMVR } from "@/lib/money";
import { fileUrl } from "@/lib/storage";
import { timeAgo } from "@/lib/dates";
import { isVipActiveRecord } from "@/lib/services/vip";
import { SoldBadge, VipBadge } from "./ui/badges";

export function ListingCard({ l, vipLabel = "VIP" }: { l: ListingCardData; vipLabel?: string }) {
  const img = fileUrl(l.images[0]?.fileId);
  const vip = isVipActiveRecord(l.seller.vipStatus);
  const featured = l.featuredUntil && l.featuredUntil > new Date();
  return (
    <Link href={`/listing/${l.id}`} className="group card block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-square bg-slate-100">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" loading="lazy" className={`h-full w-full object-cover ${l.status === "SOLD" ? "opacity-60 grayscale" : ""}`} />
        ) : (
          <div className="grid h-full place-items-center text-4xl">📦</div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {l.status === "SOLD" && <SoldBadge />}
          {featured && <span className="chip bg-coral-500 text-white">Featured</span>}
        </div>
        {vip && (
          <div className="absolute right-2 top-2">
            <VipBadge label={vipLabel} />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-base font-bold text-ocean-900">{formatMVR(l.price, { free: "Free" })}</p>
        <p className="line-clamp-2 min-h-10 text-sm text-slate-800">{l.title}</p>
        <p className="mt-1 truncate text-xs text-slate-500">
          📍 {l.island.name}, {l.atoll.code} · {l.publishedAt ? timeAgo(l.publishedAt) : ""}
        </p>
      </div>
    </Link>
  );
}

export function ListingGrid({ items, vipLabel }: { items: ListingCardData[]; vipLabel?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((l) => (
        <ListingCard key={l.id} l={l} vipLabel={vipLabel} />
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card grid place-items-center gap-2 px-6 py-12 text-center">
      <p className="text-4xl">🏝️</p>
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-slate-600">{children}</div>}
    </div>
  );
}
