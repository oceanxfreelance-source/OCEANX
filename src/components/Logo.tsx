import Link from "next/link";

export function Logo({ name, tagline, logoUrl, inverted = false }: { name: string; tagline: string; logoUrl?: string | null; inverted?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={`${name} home`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
      ) : (
        <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
          <rect width="32" height="32" rx="8" className={inverted ? "fill-white" : "fill-slate-900"} />
          <path d="M7 21.5c2.2-1.6 4.3-1.6 6.5 0s4.3 1.6 6.5 0 4.3-1.6 6.5 0" fill="none" strokeWidth="2" strokeLinecap="round" className={inverted ? "stroke-ocean-600" : "stroke-ocean-300"} />
          <path d="M9 17V10l4 4.5 4-4.5v7m3-7 3 7 3-7" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={inverted ? "stroke-slate-900" : "stroke-white"} />
        </svg>
      )}
      <span className="leading-none">
        <span className={`block text-[15px] font-semibold tracking-tight ${inverted ? "text-white" : "text-slate-900"}`}>{name}</span>
        <span className={`mt-0.5 block text-[10px] font-medium uppercase tracking-[0.18em] ${inverted ? "text-slate-400" : "text-slate-500"}`}>{tagline}</span>
      </span>
    </Link>
  );
}
