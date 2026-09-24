"use client";

import { useEffect, useRef } from "react";
import { SlidersHorizontal } from "lucide-react";

/** Collapsed "Filters" button on phones; always open as a sidebar on larger screens. */
export function FilterPanel({ count, children }: { count: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      if (ref.current && mq.matches) ref.current.open = true;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return (
    <details ref={ref} className="card group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium md:hidden [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="h-4 w-4" /> Filters &amp; sort
        {count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ocean-600 px-1.5 text-[11px] text-white">{count}</span>}
        <span className="ml-auto text-slate-400 transition group-open:rotate-180">⌄</span>
      </summary>
      {children}
    </details>
  );
}
