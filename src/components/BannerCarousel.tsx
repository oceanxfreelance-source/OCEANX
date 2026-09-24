"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";

export type BannerSlide = {
  id: string;
  title: string;
  subtitle: string | null;
  background: string;
  image: string | null;
  href: string | null;
  label: string | null;
  ctaText: string | null;
};

/** Home-page ad slider: swipeable, auto-advances every `seconds`, with progress dots. Sponsor links open in a new tab. */
export function BannerCarousel({ slides, seconds = 5 }: { slides: BannerSlide[]; seconds?: number }) {
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
    const t = setTimeout(() => go((active + 1) % slides.length), seconds * 1000);
    return () => clearTimeout(t);
  }, [active, paused, slides.length, seconds]);

  return (
    <section
      aria-label="Advertisements"
      aria-roledescription="carousel"
      className="-mx-4 sm:mx-0"
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
          if (i !== active) setActive(i);
        }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto sm:rounded-2xl"
      >
        {slides.map((b, i) => {
          const external = !!b.href && /^https?:\/\//.test(b.href);
          const inner = (
            <div className="relative flex aspect-[2/1] w-full items-end overflow-hidden p-5 text-white sm:aspect-[3/1] sm:p-8" style={{ background: b.background }}>
              {b.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.image} alt="" className="ad-img absolute inset-0 h-full w-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
              {b.label && <span className="absolute right-3 top-3 rounded-md bg-black/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">{b.label}</span>}
              <div className="ad-text relative max-w-lg">
                <p className="text-xl font-semibold leading-tight tracking-tight sm:text-3xl">{b.title}</p>
                {b.subtitle && <p className="mt-1 text-sm text-white/85 sm:text-base">{b.subtitle}</p>}
                {b.href && (
                  <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink sm:text-sm">
                    {b.ctaText || (external ? "Visit" : "Learn more")} <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
            </div>
          );
          return (
            <div key={b.id} className={clsx("w-full shrink-0 snap-start", i === active && "ad-active")} aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>
              {b.href ? (
                external ? (
                  <a href={b.href} target="_blank" rel="sponsored noopener noreferrer">{inner}</a>
                ) : (
                  <Link href={b.href}>{inner}</Link>
                )
              ) : (
                inner
              )}
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
              aria-label={`Show ad ${i + 1}`}
              aria-current={i === active}
              onClick={() => go(i)}
              className={clsx("relative h-1.5 overflow-hidden rounded-full bg-slate-300 transition-all duration-300", i === active ? "w-8" : "w-1.5")}
            >
              {i === active && (
                <span
                  key={`${active}-${paused}`}
                  className="ad-progress absolute inset-y-0 left-0 rounded-full bg-slate-800"
                  style={{ animationDuration: `${seconds}s`, animationPlayState: paused ? "paused" : "running" }}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
