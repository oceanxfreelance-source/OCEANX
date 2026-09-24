import Link from "next/link";
import { ImageOff, MapPin } from "lucide-react";
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
    <Link href={`/listing/${l.id}`} className="group block overflow-hidden rounded-xl border border-slate-200/80 bg-white transition hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" loading="lazy" className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] ${l.status === "SOLD" ? "opacity-60 grayscale" : ""}`} />
        ) : (
          <div className="grid h-full place-items-center text-slate-300"><ImageOff className="h-8 w-8" /></div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {l.status === "SOLD" && <SoldBadge />}
          {featured && <span className="chip bg-white/95 text-slate-900 shadow-sm">Featured</span>}
        </div>
        {vip && (
          <div className="absolute right-2 top-2">
            <VipBadge label={vipLabel} />
          </div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-1 text-sm font-medium text-slate-800">{l.title}</p>
        <p className="text-[15px] font-semibold tracking-tight text-slate-900">{formatMVR(l.price, { free: "Free" })}</p>
        <p className="flex items-center gap-1 truncate text-xs text-slate-500">
          <MapPin className="h-3 w-3 shrink-0" /> {l.island.name}, {l.atoll.code}
          <span className="text-slate-300">·</span> {l.publishedAt ? timeAgo(l.publishedAt) : ""}
        </p>
      </div>
    </Link>
  );
}

export function ListingGrid({ items, vipLabel }: { items: ListingCardData[]; vipLabel?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {items.map((l) => (
        <ListingCard key={l.id} l={l} vipLabel={vipLabel} />
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <p className="font-medium text-slate-900">{title}</p>
      {children && <div className="text-sm text-slate-500">{children}</div>}
    </div>
  );
}
