import Link from "next/link";
import { getSiteSettings } from "@/lib/site";
import { Logo } from "./Logo";

export async function Footer() {
  const s = await getSiteSettings();
  const cols: { title: string; links: [string, string][] }[] = [
    { title: "Marketplace", links: [["/search", "Browse listings"], ["/categories", "Categories"], ["/sell", "Post a listing"], ["/giveaways", "Giveaways"]] },
    { title: "Programs", links: [["/vip", "Stars & VIP"], ["/business", "Business accounts"], ["/account/referrals", "Invite friends"]] },
    { title: "Legal", links: [["/terms", "Terms of use"], ["/privacy", "Privacy policy"]] },
  ];
  return (
    <footer className="bg-slate-950 pb-24 text-slate-400 md:pb-0">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo name={s.general.marketplaceName} tagline={s.general.tagline} inverted />
          <p className="max-w-xs text-sm leading-relaxed">The Maldives-first marketplace. A small one-time posting fee, and never a commission on your sale.</p>
          <div className="space-y-1 text-sm">
            {s.general.supportEmail && <p><a href={`mailto:${s.general.supportEmail}`} className="hover:text-white">{s.general.supportEmail}</a></p>}
            {s.general.supportPhone && <p><a href={`tel:${s.general.supportPhone}`} className="hover:text-white">{s.general.supportPhone}</a></p>}
          </div>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{c.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {c.links.map(([href, label]) => (
                <li key={href}><Link href={href} className="hover:text-white">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-slate-500">© {new Date().getFullYear()} OceanX. All rights reserved.</p>
      </div>
    </footer>
  );
}
