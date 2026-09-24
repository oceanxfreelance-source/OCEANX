import Link from "next/link";
import { searchListings, CONDITIONS } from "@/lib/services/listings";
import { getActiveCategories, getActiveLocations, getSiteSettings } from "@/lib/site";
import { ListingGrid, EmptyState } from "@/components/ListingCard";
import { Pagination } from "@/components/Pagination";

export const metadata = { title: "Search listings" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const [res, categories, atolls, settings] = await Promise.all([searchListings(raw), getActiveCategories(), getActiveLocations(), getSiteSettings()]);
  const p = res.params;
  const activeCat = categories.find((c) => c.slug === p.category);
  const flatParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) if (k !== "page" && v) flatParams[k] = String(v);

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <aside>
        <details className="card group md:open" open>
          <summary className="flex cursor-pointer items-center justify-between p-4 font-semibold md:hidden">
            Filters <span className="text-slate-400 group-open:rotate-180">⌄</span>
          </summary>
          <form action="/search" className="space-y-3 p-4 pt-0 md:pt-4">
            <div>
              <label className="label" htmlFor="q">Keywords</label>
              <input id="q" name="q" defaultValue={p.q} className="input" placeholder="What are you looking for?" />
            </div>
            <div>
              <label className="label" htmlFor="category">Category</label>
              <select id="category" name="category" defaultValue={p.category} className="input">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
            {activeCat && activeCat.subcategories.length > 0 && (
              <div>
                <label className="label" htmlFor="sub">Subcategory</label>
                <select id="sub" name="sub" defaultValue={p.sub} className="input">
                  <option value="">All {activeCat.name}</option>
                  {activeCat.subcategories.map((s) => (
                    <option key={s.id} value={s.slug}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="label" htmlFor="atoll">Atoll</label>
              <select id="atoll" name="atoll" defaultValue={p.atoll} className="input">
                <option value="">All Maldives</option>
                {atolls.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="island">Island</label>
              <select id="island" name="island" defaultValue={p.island} className="input">
                <option value="">Any island</option>
                {atolls
                  .filter((a) => !p.atoll || a.id === p.atoll)
                  .map((a) => (
                    <optgroup key={a.id} label={a.name}>
                      {a.islands.map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="min">Min MVR</label>
                <input id="min" name="min" inputMode="numeric" defaultValue={p.min} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="max">Max MVR</label>
                <input id="max" name="max" inputMode="numeric" defaultValue={p.max} className="input" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="condition">Condition</label>
              <select id="condition" name="condition" defaultValue={p.condition} className="input">
                <option value="">Any condition</option>
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="sort">Sort by</label>
              <select id="sort" name="sort" defaultValue={p.sort} className="input">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="vip" value="1" defaultChecked={p.vip === "1"} className="h-5 w-5 accent-ocean-700" /> {settings.vip.badgeName} sellers only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="sold" value="1" defaultChecked={p.sold === "1"} className="h-5 w-5 accent-ocean-700" /> Include sold items
            </label>
            <button className="btn-primary w-full">Apply filters</button>
            <Link href="/search" className="btn-ghost w-full">Clear</Link>
          </form>
        </details>
      </aside>
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="text-lg font-bold">{p.q ? `Results for “${p.q}”` : activeCat ? activeCat.name : "All listings"}</h1>
          <span className="text-sm text-slate-500">{res.total.toLocaleString()} found</span>
        </div>
        {res.items.length ? <ListingGrid items={res.items} vipLabel={settings.vip.badgeName} /> : <EmptyState title="No listings match your search">Try fewer keywords or clear some filters.</EmptyState>}
        <Pagination page={p.page} pages={res.pages} params={flatParams} basePath="/search" />
      </section>
    </div>
  );
}
