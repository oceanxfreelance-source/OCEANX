import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { searchListings, CONDITIONS } from "@/lib/services/listings";
import { getActiveCategories, getActiveLocations, getSiteSettings } from "@/lib/site";
import { ListingGrid, EmptyState } from "@/components/ListingCard";
import { Pagination } from "@/components/Pagination";
import { FilterPanel } from "@/components/FilterPanel";
import { Search } from "lucide-react";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const sp = await searchParams;
  const cat = typeof sp.category === "string" ? sp.category : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const category = cat ? await prisma.category.findUnique({ where: { slug: cat }, select: { name: true } }) : null;
  const title = q ? `“${q}” for sale in the Maldives` : category ? `${category.name} for sale in the Maldives` : "Browse listings in the Maldives";
  const onlyCategory = Object.keys(sp).every((k) => k === "category" || k === "sub");
  return {
    title,
    description: category ? `Buy and sell ${category.name.toLowerCase()} across Malé, Hulhumalé, Addu and every atoll on MV Markets.` : undefined,
    // Free-text and heavily filtered searches are not indexed; plain category pages are.
    robots: q || !onlyCategory ? { index: false, follow: true } : undefined,
    alternates: onlyCategory ? { canonical: cat ? `/search?category=${cat}${typeof sp.sub === "string" ? `&sub=${sp.sub}` : ""}` : "/search" } : undefined,
  };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const [res, categories, atolls, settings] = await Promise.all([searchListings(raw), getActiveCategories(), getActiveLocations(), getSiteSettings()]);
  const p = res.params;
  const activeCat = categories.find((c) => c.slug === p.category);
  const flatParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) if (k !== "page" && v) flatParams[k] = String(v);

  const filterCount = [p.sub, p.atoll || p.island, p.min || p.max, p.condition, p.vip, p.sold, p.sort !== "newest" ? "1" : ""].filter(Boolean).length;
  const chipHref = (slug: string) => {
    const qs = new URLSearchParams();
    if (p.q) qs.set("q", p.q);
    if (slug) qs.set("category", slug);
    const str = qs.toString();
    return str ? `/search?${str}` : "/search";
  };

  return (
    <div className="space-y-4">
      <form action="/search" role="search" className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input name="q" type="search" defaultValue={p.q} placeholder="Search cars, phones, furniture…" className="input h-12 pl-10 pr-24" aria-label="Search listings" />
        {p.category && <input type="hidden" name="category" value={p.category} />}
        <button className="btn-accent btn-sm absolute right-1.5 top-1/2 -translate-y-1/2">Search</button>
      </form>

      <nav aria-label="Categories" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {[{ slug: "", name: "All" }, ...categories].map((c) => {
          const on = (p.category || "") === c.slug;
          return (
            <Link
              key={c.slug || "all"}
              href={chipHref(c.slug)}
              className={on ? "shrink-0 rounded-full bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white" : "shrink-0 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 hover:border-slate-300"}
            >
              {c.name}
            </Link>
          );
        })}
      </nav>

      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <aside>
          <FilterPanel count={filterCount}>
            <form action="/search" className="space-y-3 p-4 pt-1 md:pt-4">
              {p.q && <input type="hidden" name="q" value={p.q} />}
              {p.category && <input type="hidden" name="category" value={p.category} />}
              <div>
                <label className="label" htmlFor="sort">Sort by</label>
                <select id="sort" name="sort" defaultValue={p.sort} className="input">
                  <option value="newest">Newest first</option>
                  <option value="price_asc">Price: low to high</option>
                  <option value="price_desc">Price: high to low</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
              {activeCat && activeCat.subcategories.length > 0 && (
                <div>
                  <label className="label" htmlFor="sub">Type</label>
                  <select id="sub" name="sub" defaultValue={p.sub} className="input">
                    <option value="">All {activeCat.name}</option>
                    {activeCat.subcategories.map((s) => (
                      <option key={s.id} value={s.slug}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Price (MVR)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input name="min" inputMode="numeric" defaultValue={p.min} className="input" placeholder="Min" aria-label="Minimum price" />
                  <input name="max" inputMode="numeric" defaultValue={p.max} className="input" placeholder="Max" aria-label="Maximum price" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="atoll">Location</label>
                <select id="atoll" name="atoll" defaultValue={p.atoll} className="input">
                  <option value="">All Maldives</option>
                  {atolls.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="condition">Condition</label>
                <select id="condition" name="condition" defaultValue={p.condition} className="input">
                  <option value="">Any</option>
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="vip" value="1" defaultChecked={p.vip === "1"} className="h-5 w-5 accent-ocean-700" /> {settings.vip.badgeName} sellers only
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="sold" value="1" defaultChecked={p.sold === "1"} className="h-5 w-5 accent-ocean-700" /> Include sold items
              </label>
              <button className="btn-primary w-full">Show results</button>
              {filterCount > 0 && <Link href={chipHref(p.category)} className="btn-ghost w-full">Reset filters</Link>}
            </form>
          </FilterPanel>
        </aside>
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h1 className="truncate text-lg font-semibold">{p.q ? `Results for “${p.q}”` : activeCat ? activeCat.name : "All listings"}</h1>
            <span className="shrink-0 text-sm text-slate-500">{res.total.toLocaleString()} found</span>
          </div>
          {res.relaxed && <p className="mb-3 text-sm text-slate-500">No exact matches for every word — showing items that match some of them.</p>}
          {res.items.length ? (
            <ListingGrid items={res.items} vipLabel={settings.vip.badgeName} />
          ) : (
            <EmptyState title="Nothing found">
              Try another word{p.category || filterCount ? <>, or <Link href="/search" className="font-medium text-ocean-700 underline">see all listings</Link></> : null}.
            </EmptyState>
          )}
          <Pagination page={p.page} pages={res.pages} params={flatParams} basePath="/search" />
        </section>
      </div>
    </div>
  );
}
