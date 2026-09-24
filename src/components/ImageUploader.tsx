"use client";

import { Camera, X } from "lucide-react";
import { useRef, useState } from "react";
import { compressImage } from "./client-image";

type Img = { id: string; url: string };

export function ImageUploader({ name = "imageIds", initial = [], max = 8, purpose = "listing_image" }: { name?: string; initial?: Img[]; max?: number; purpose?: string }) {
  const [images, setImages] = useState<Img[]>(initial);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files) return;
    setError(null);
    const room = max - images.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) setError(`You can add up to ${max} photos.`);
    for (const f of list) {
      setBusy((b) => b + 1);
      try {
        const small = await compressImage(f);
        const fd = new FormData();
        fd.append("file", small);
        fd.append("purpose", purpose);
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Upload failed");
        setImages((prev) => (prev.length < max ? [...prev, { id: json.id, url: json.url }] : prev));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy((b) => b - 1);
      }
    }
    if (input.current) input.current.value = "";
  }

  function move(idx: number, dir: -1 | 1) {
    setImages((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((img, idx) => (
          <div key={img.id} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={`Photo ${idx + 1}`} className="h-full w-full object-cover" />
            <input type="hidden" name={name} value={img.id} />
            {idx === 0 && <span className="absolute left-1 top-1 rounded bg-ocean-700 px-1.5 text-[10px] font-semibold text-white">COVER</span>}
            <div className="absolute inset-x-1 bottom-1 flex justify-between">
              <button type="button" onClick={() => move(idx, -1)} className="grid h-7 w-7 place-items-center rounded-full bg-surface/90 text-sm shadow" aria-label="Move left">‹</button>
              <button type="button" onClick={() => setImages((p) => p.filter((x) => x.id !== img.id))} className="grid h-7 w-7 place-items-center rounded-full bg-red-600 text-sm text-white shadow" aria-label="Remove photo"><X className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => move(idx, 1)} className="grid h-7 w-7 place-items-center rounded-full bg-surface/90 text-sm shadow" aria-label="Move right">›</button>
            </div>
          </div>
        ))}
        {images.length < max && (
          <button type="button" onClick={() => input.current?.click()} className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-line-strong text-slate-500 hover:border-ocean-500 hover:text-ocean-700">
            <span className="text-center text-sm">
              <Camera className="mx-auto mb-1 h-6 w-6" strokeWidth={1.75} />
              {busy > 0 ? "Uploading…" : "Add photos"}
            </span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} data-testid="image-input" />
      <p className="mt-1 text-xs text-slate-500">
        {images.length}/{max} photos · first photo is the cover. Location data is removed automatically.
      </p>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
