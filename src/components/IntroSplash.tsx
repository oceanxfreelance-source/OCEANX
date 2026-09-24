"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Opening logo animation, shown on every full page load (first visit or refresh) but not on
 * in-app navigation. The mark flips in with a shine, pulses, then slides aside as the name wipes in.
 * It is rendered on the server so it covers the page from the first paint; the CSS animation
 * hides it by itself even if JavaScript never runs, and a tap skips it.
 */
export function IntroSplash({ name, tagline, logoUrl }: { name: string; tagline: string; logoUrl: string | null }) {
  const path = usePathname();
  const [gone, setGone] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setGone(true), 3400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setGone(true), 350);
    return () => clearTimeout(t);
  }, [leaving]);

  if (gone || path.startsWith("/admin")) return null;

  return (
    <div className={`intro-splash${leaving ? " intro-leaving" : ""}`} aria-hidden onClick={() => setLeaving(true)}>
      <div className="intro-glow" />
      <div className="intro-row">
        <div className="intro-mark">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-full w-full rounded-[22%] object-cover" />
          ) : (
            <svg viewBox="0 0 32 32" className="h-full w-full">
              <rect width="32" height="32" rx="8" fill="#fff" />
              <path className="intro-draw intro-draw-mv" pathLength={1} d="M9 17V10l4 4.5 4-4.5v7m3-7 3 7 3-7" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path className="intro-draw intro-draw-wave" pathLength={1} d="M7 21.5c2.2-1.6 4.3-1.6 6.5 0s4.3 1.6 6.5 0 4.3-1.6 6.5 0" fill="none" stroke="#1d5d8d" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          <span className="intro-shine" />
        </div>
        <div className="intro-word">
          <span className="intro-name">{name}</span>
          <span className="intro-tag">{tagline}</span>
        </div>
      </div>
    </div>
  );
}
