"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [i, setI] = useState(0);
  if (!images.length) return <div className="grid aspect-[4/3] place-items-center rounded-xl bg-slate-100 text-slate-300"><ImageOff className="h-10 w-10" /></div>;
  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[i]} alt={`${title} photo ${i + 1}`} className="h-full w-full object-contain" />
        {images.length > 1 && (
          <>
            <button type="button" aria-label="Previous photo" onClick={() => setI((i - 1 + images.length) % images.length)} className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-surface/90 text-xl shadow">
              ‹
            </button>
            <button type="button" aria-label="Next photo" onClick={() => setI((i + 1) % images.length)} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-surface/90 text-xl shadow">
              ›
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              {i + 1}/{images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {images.map((src, idx) => (
            <button key={src} type="button" onClick={() => setI(idx)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-2 ${idx === i ? "ring-ocean-600" : "ring-transparent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
