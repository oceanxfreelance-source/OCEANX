import Link from "next/link";
import { getSiteSettings } from "@/lib/site";

export async function Footer() {
  const s = await getSiteSettings();
  return (
    <footer className="border-t border-slate-200 bg-white pb-24 md:pb-0">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-slate-600 sm:grid-cols-3">
        <div>
          <p className="font-bold text-ocean-900">
            {s.general.marketplaceName} <span className="font-medium text-ocean-600">{s.general.tagline}</span>
          </p>
          <p className="mt-2">The Maldives-first marketplace. No commission on your sale — just a small one-time posting fee.</p>
        </div>
        <ul className="space-y-1.5">
          <li><Link href="/search" className="hover:text-ocean-700">Browse listings</Link></li>
          <li><Link href="/categories" className="hover:text-ocean-700">Categories</Link></li>
          <li><Link href="/vip" className="hover:text-ocean-700">Stars & VIP program</Link></li>
          <li><Link href="/giveaways" className="hover:text-ocean-700">Giveaways</Link></li>
          <li><Link href="/business" className="hover:text-ocean-700">Business accounts</Link></li>
        </ul>
        <ul className="space-y-1.5">
          <li><Link href="/terms" className="hover:text-ocean-700">Terms of use</Link></li>
          <li><Link href="/privacy" className="hover:text-ocean-700">Privacy policy</Link></li>
          {s.general.supportEmail && <li>Support: <a href={`mailto:${s.general.supportEmail}`} className="hover:text-ocean-700">{s.general.supportEmail}</a></li>}
          {s.general.supportPhone && <li>Hotline: <a href={`tel:${s.general.supportPhone}`} className="hover:text-ocean-700">{s.general.supportPhone}</a></li>}
        </ul>
      </div>
      <p className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">© {new Date().getFullYear()} OceanX. All rights reserved.</p>
    </footer>
  );
}
