import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { getSiteSettings } from "@/lib/site";
import { vipEligibility, isVipActiveRecord } from "@/lib/services/vip";
import { userRewardHistory } from "@/lib/services/rewards";
import { quotePostingFee } from "@/lib/services/fees";
import { formatMVR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { LevelBadge, StarsBadge, StatusBadge, VipBadge } from "@/components/ui/badges";

export const metadata = { title: "Stars & VIP" };

export default async function MyVipPage() {
  const user = await requireUser("/account/vip");
  const settings = await getSiteSettings();
  const elig = await vipEligibility(user.id, settings);
  const [vip, stats, history, rewards, quote] = await Promise.all([
    prisma.vipStatus.findUnique({ where: { userId: user.id } }),
    prisma.sellerStatistics.findUnique({ where: { userId: user.id }, include: { level: true } }),
    prisma.vipHistory.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    userRewardHistory(user.id),
    quotePostingFee(user.id),
  ]);
  const active = isVipActiveRecord(vip) && settings.vip.enabled;
  const b = settings.vip.badgeName;
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-5 ${active ? "bg-slate-950 text-white" : "card"}`}>
        <div className="flex flex-wrap items-center gap-2">
          {active ? <VipBadge label={b} size="md" /> : <StatusBadge status={vip?.state ?? "NONE"} labels={{ NONE: `Not ${b} yet`, EXPIRED: `${b} expired`, PENDING_APPROVAL: "Qualified — awaiting approval", SUSPENDED: `${b} suspended` }} />}
          <StarsBadge stars={stats?.stars ?? 0} />
          <LevelBadge level={stats?.level} />
        </div>
        {active && vip?.expiresAt && (
          <p className="mt-3 text-lg font-semibold">
            {b} until {formatDate(vip.expiresAt)}
            {vip.renewals > 0 && <span className="text-sm font-normal"> · renewed {vip.renewals}×</span>}
          </p>
        )}
        {vip?.state === "SUSPENDED" && vip.suspendedReason && <p className="mt-2 text-sm text-red-700">Reason: {vip.suspendedReason}</p>}
        {quote.isVipRate && <p className="mt-2 text-sm text-slate-300">Reduced {b} posting fees are active on your listings.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Stars", stats?.stars ?? 0],
          ["Successful deals", stats?.countedDeals ?? 0],
          [`Deals (last ${settings.vip.windowDays}d)`, elig.metrics.dealsInWindow],
          ["Awaiting buyer", stats?.pendingDeals ?? 0],
        ].map(([k, v]) => (
          <div key={k} className="card p-3">
            <p className="text-xs text-slate-500">{k}</p>
            <p className="text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <section className="card p-4">
        <h2 className="font-semibold">{active ? `Stay ${b} — renewal requirements` : `Your progress to ${b}`}</h2>
        <ul className="mt-3 space-y-3">
          {elig.requirements.map((r) => {
            const pct = r.kind === "min" ? Math.min(100, r.required === 0 ? 100 : Math.round((r.current / r.required) * 100)) : r.met ? 100 : 0;
            return (
              <li key={r.label}>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">{r.met ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />} {r.label}</span>
                  <span className="font-medium">
                    {r.current} {r.kind === "min" ? `/ ${r.required}` : `(max ${r.required})`}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${r.met ? "bg-emerald-500" : "bg-ocean-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Only genuine completed sales count. <Link href="/vip" className="underline">How VIP works</Link>
        </p>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">Monthly {b} rewards</h2>
        {rewards.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No rewards yet. Active {b} sellers share a monthly reward pool set by OceanX.</p>
        ) : (
          <table className="table mt-2">
            <thead><tr><th>Month</th><th>Reward</th><th>Status</th><th>Paid</th></tr></thead>
            <tbody>
              {rewards.map((r) => (
                <tr key={r.id}>
                  <td>{r.pool.month}</td>
                  <td className="font-semibold">{formatMVR(r.finalAmount)}{r.adjustment !== 0 && <span className="block text-xs text-slate-500">incl. adjustment {formatMVR(r.adjustment)}</span>}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.payments[0] ? formatDate(r.payments[0].paidAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {history.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold">{b} history</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between gap-2 py-2">
                <span><StatusBadge status={h.event === "GRANTED" || h.event === "RENEWED" || h.event === "APPROVED" || h.event === "RESTORED" ? "ACTIVE" : h.event === "QUALIFIED" ? "PENDING_APPROVAL" : "EXPIRED"} labels={{ ACTIVE: h.event, PENDING_APPROVAL: h.event, EXPIRED: h.event }} /> {h.reason}</span>
                <span className="shrink-0 text-slate-500">{formatDate(h.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
