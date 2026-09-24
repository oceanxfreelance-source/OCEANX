import Link from "next/link";

export function Logo({ name, tagline, logoUrl }: { name: string; tagline: string; logoUrl?: string | null }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={`${name} home`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-9 w-9 rounded-xl object-cover" />
      ) : (
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-ocean-500 to-ocean-800 text-lg font-black text-white shadow">
          MV
        </span>
      )}
      <span className="leading-tight">
        <span className="block text-base font-extrabold tracking-tight text-ocean-900">{name}</span>
        <span className="block text-[10px] font-medium uppercase tracking-widest text-ocean-600">{tagline}</span>
      </span>
    </Link>
  );
}
