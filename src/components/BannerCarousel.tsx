"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

export type BannerSlide = { id: string; title: string; subtitle: string | null; background: string; image: string | null; href: string | null };

/** Full-width ad slider: swipeable, auto-advances every 5s, with dots. */
export function BannerCarousel({ slides }: { slides: BannerSlide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const t = setInterval(() => go((active + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [active, paused, slides.length]);

  return (
    <section aria-label="Promotions" className="-mx-4 sm:mx-0" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
        }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto sm:rounded-2xl"
      >
        {slides.map((b) => {
          const inner = (
            <div className="relative flex aspect-[2/1] w-full items-end overflow-hidden p-5 text-white sm:aspect-[3/1] sm:p-8" style={{ background: b.background }}>
              {b.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <div className="relative max-w-lg">
                <p className="text-xl font-semibold leading-tight tracking-tight sm:text-3xl">{b.title}</p>
                {b.subtitle && <p className="mt-1 text-sm text-white/85 sm:text-base">{b.subtitle}</p>}
              </div>
            </div>
          );
          return (
            <div key={b.id} className="w-full shrink-0 snap-start">
              {b.href ? <Link href={b.href}>{inner}</Link> : inner}
            </div>
          );
        })}
      </div>
      {slides.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {slides.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Show promotion ${i + 1}`}
              aria-current={i === active}
              onClick={() => go(i)}
              className={clsx("h-1.5 rounded-full transition-all", i === active ? "w-5 bg-slate-800" : "w-1.5 bg-slate-300")}
            />
          ))}
        </div>
      )}
    </section>
  );
}
