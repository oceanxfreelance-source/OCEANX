"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Gift, Sparkles } from "lucide-react";

export type PromoGiveaway = { id: string; title: string; prize: string; endsAt: string; image: string | null };

function left(ms: number) {
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** Animated giveaway advert shown at the very top of the home page. */
export function GiveawayPromo({ g, more }: { g: PromoGiveaway; more: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = now === null ? null : left(new Date(g.endsAt).getTime() - now);

  return (
    <Link href={`/giveaways#g-${g.id}`} className="gw-promo group relative -mx-4 block overflow-hidden px-4 py-4 text-white sm:mx-0 sm:rounded-2xl sm:px-6 sm:py-5" aria-label={`Giveaway: ${g.title} — win ${g.prize}`}>
      <span className="gw-shine" aria-hidden />
      <span className="gw-spark gw-spark-1" aria-hidden />
      <span className="gw-spark gw-spark-2" aria-hidden />
      <span className="gw-spark gw-spark-3" aria-hidden />
      <div className="relative flex items-center gap-4">
        <div className="gw-gift relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur sm:h-16 sm:w-16">
          {g.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={g.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <Gift className="h-7 w-7" strokeWidth={1.75} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
            <Sparkles className="h-3.5 w-3.5" /> Giveaway{more > 0 ? ` · +${more} more` : ""}
          </p>
          <p className="mt-0.5 truncate text-base font-semibold leading-tight sm:text-lg">Win {g.prize}</p>
          <p className="truncate text-xs text-white/80 sm:text-sm">{g.title}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-wider text-white/70">Ends in</p>
          <p className="font-mono text-sm font-semibold tabular-nums sm:text-base" suppressHydrationWarning>{remaining ?? "—"}</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink transition group-hover:gap-1.5">
            Join <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
