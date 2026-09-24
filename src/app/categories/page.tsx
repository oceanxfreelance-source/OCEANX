import Link from "next/link";
import { getActiveCategories } from "@/lib/site";
import { fileUrl } from "@/lib/storage";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const categories = await getActiveCategories();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">All categories</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <div key={c.id} className="card p-4">
            <Link href={`/search?category=${c.slug}`} className="flex items-center gap-3 font-semibold hover:text-ocean-700">
              {c.imageFileId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(c.imageFileId)!} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <span className="text-2xl">{c.icon ?? "📦"}</span>
              )}
              {c.name}
            </Link>
            {c.subcategories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.subcategories.map((s) => (
                  <Link key={s.id} href={`/search?category=${c.slug}&sub=${s.slug}`} className="chip bg-slate-100 text-slate-700 hover:bg-ocean-50">
                    {s.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
