import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSiteSettings } from "@/lib/site";
import { formatMVR } from "@/lib/money";
import { VipBadge } from "@/components/ui/badges";

export const metadata = { title: "Stars & VIP program" };

export default async function VipInfoPage() {
  const [s, levels] = await Promise.all([getSiteSettings(), prisma.sellerLevel.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })]);
  const v = s.vip;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-amber-300 via-gold-400 to-amber-500 p-6 text-amber-950 shadow">
        <VipBadge label={v.badgeName} size="md" />
        <h1 className="mt-3 text-3xl font-extrabold">Sell more. Pay less. Share the rewards.</h1>
        <p className="mt-2">{v.badgeDescription}</p>
      </section>
      <section className="card p-5">
        <h2 className="text-lg font-bold">How it works</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-700">
          <li>Each genuine completed sale earns you <strong>{s.stars.starsPerDeal} Star{s.stars.starsPerDeal === 1 ? "" : "s"}</strong>. Sales count once the buyer confirms on MV Markets.</li>
          <li>
            Reach <strong>{v.minStars} Stars</strong> and <strong>{v.minDealsTotal} successful deals</strong>, with at least <strong>{v.minDealsInWindow} in the last {v.windowDays} days</strong>
            {s.cancellation.affectsVipEligibility ? <> and no more than <strong>{v.maxCancellationsInWindow} voluntary cancellations</strong> in that time</> : null}.
          </li>
          <li>You become <strong>{v.badgeName}</strong> for <strong>{v.durationMonths} months</strong>{v.requireAdminApproval ? " (after a quick review by OceanX)" : ""}.</li>
          <li>At the end of the period, if you&apos;re still actively selling and meet the requirements, {v.badgeName} renews automatically.</li>
        </ol>
        <p className="mt-3 text-sm text-slate-500">Posting lots of listings does not earn Stars — only completed deals do.</p>
      </section>
      <section className="card p-5">
        <h2 className="text-lg font-bold">{v.badgeName} benefits</h2>
        <ul className="mt-3 space-y-2">
          <li className="flex gap-2">💸 Posting fee <strong>{formatMVR(s.fees.vipPostingFee)}</strong> instead of {formatMVR(s.fees.postingFee)}</li>
          {v.benefits.map((b) => (
            <li key={b} className="flex gap-2">✅ {b}</li>
          ))}
        </ul>
      </section>
      <section className="card p-5">
        <h2 className="text-lg font-bold">Seller levels</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {levels.map((l) => (
            <div key={l.id} className="rounded-xl border border-slate-200 p-3">
              <p className="font-semibold" style={{ color: l.color }}>{l.badge} {l.name}</p>
              <p className="text-xs text-slate-500">{l.minStars}+ Stars · {l.minDeals}+ deals</p>
              {l.description && <p className="mt-1 text-sm text-slate-600">{l.description}</p>}
            </div>
          ))}
        </div>
      </section>
      <Link href="/sell" className="btn-accent w-full">Start selling</Link>
    </div>
  );
}
