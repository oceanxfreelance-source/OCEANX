"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

/** Phone search bar under the header; hidden on the search page, which has its own. */
export function MobileHeaderSearch() {
  const path = usePathname();
  if (path.startsWith("/search") || path.startsWith("/admin")) return null;
  return (
    <form action="/search" className="relative px-4 pb-3 md:hidden" role="search">
      <Search className="pointer-events-none absolute left-7 top-[1.35rem] h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input name="q" type="search" placeholder="Search MV Markets" className="input h-10 min-h-10 bg-slate-50 pl-9 shadow-none" aria-label="Search listings" />
    </form>
  );
}
