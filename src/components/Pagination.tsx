import Link from "next/link";

export function Pagination({ page, pages, params, basePath }: { page: number; pages: number; params: Record<string, string>; basePath: string }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams({ ...params, page: String(p) });
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
      {page > 1 && (
        <Link href={href(page - 1)} className="btn-secondary">
          ← Prev
        </Link>
      )}
      <span className="px-3 text-sm text-slate-600">
        Page {page} of {pages}
      </span>
      {page < pages && (
        <Link href={href(page + 1)} className="btn-secondary">
          Next →
        </Link>
      )}
    </nav>
  );
}
