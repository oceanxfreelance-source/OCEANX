"use client";

import { useState } from "react";

type Cat = { id: string; name: string; icon: string | null; subcategories: { id: string; name: string }[] };
type Atoll = { id: string; name: string; islands: { id: string; name: string; locations: { id: string; name: string }[] }[] };

export function CategoryPicker({ categories, defaultCategory, defaultSub }: { categories: Cat[]; defaultCategory?: string; defaultSub?: string | null }) {
  const [cat, setCat] = useState(defaultCategory ?? "");
  const subs = categories.find((c) => c.id === cat)?.subcategories ?? [];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="categoryId">Category</label>
        <select id="categoryId" name="categoryId" required className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="subcategoryId">Subcategory</label>
        <select id="subcategoryId" name="subcategoryId" className="input" defaultValue={defaultSub ?? ""} key={cat} disabled={!subs.length}>
          <option value="">{subs.length ? "Choose…" : "—"}</option>
          {subs.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function LocationPicker({ atolls, defaults, withLocation = true, required = true }: { atolls: Atoll[]; defaults?: { atollId?: string | null; islandId?: string | null; locationId?: string | null }; withLocation?: boolean; required?: boolean }) {
  const [atoll, setAtoll] = useState(defaults?.atollId ?? "");
  const [island, setIsland] = useState(defaults?.islandId ?? "");
  const islands = atolls.find((a) => a.id === atoll)?.islands ?? [];
  const locations = islands.find((i) => i.id === island)?.locations ?? [];
  return (
    <div className={`grid gap-3 ${withLocation ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      <div>
        <label className="label" htmlFor="atollId">Atoll</label>
        <select id="atollId" name="atollId" required={required} className="input" value={atoll} onChange={(e) => { setAtoll(e.target.value); setIsland(""); }}>
          <option value="">{required ? "Choose…" : "Any / not specified"}</option>
          {atolls.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="islandId">Island</label>
        <select id="islandId" name="islandId" required={required} className="input" value={island} onChange={(e) => setIsland(e.target.value)} disabled={!islands.length}>
          <option value="">{required ? "Choose…" : "Not specified"}</option>
          {islands.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>
      {withLocation && (
        <div>
          <label className="label" htmlFor="locationId">Area</label>
          <select id="locationId" name="locationId" className="input" defaultValue={defaults?.locationId ?? ""} key={island} disabled={!locations.length}>
            <option value="">{locations.length ? "Choose…" : "—"}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export function SlipInput() {
  const [info, setInfo] = useState<string | null>(null);
  return (
    <div>
      <input
        id="slip"
        name="slip"
        type="file"
        required
        accept="image/*,application/pdf"
        className="input py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-ocean-50 file:px-3 file:py-1.5 file:font-semibold file:text-ocean-800"
        onChange={async (e) => {
          const input = e.currentTarget;
          const f = input.files?.[0];
          if (!f) return;
          if (f.type.startsWith("image/") && f.size > 2_500_000) {
            const { compressImage } = await import("./client-image");
            const small = await compressImage(f, 2400, 0.9);
            if (small !== f && typeof DataTransfer !== "undefined") {
              const dt = new DataTransfer();
              dt.items.add(small);
              input.files = dt.files;
            }
            setInfo(`${(small.size / 1024 / 1024).toFixed(1)} MB`);
          } else setInfo(`${(f.size / 1024 / 1024).toFixed(1)} MB`);
        }}
      />
      {info && <p className="mt-1 text-xs text-slate-500">Ready to upload ({info})</p>}
    </div>
  );
}
