import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { getSiteSettings } from "@/lib/site";
import { formatMVR } from "@/lib/money";
import { currentMonth } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { PageTitle, Section, TableWrap } from "@/components/admin/ui";
import { savePoolAction } from "@/app/actions/admin";

export default async function AdminRewardsPage() {
  await requireAdminPage("rewards");
  const [pools, settings] = await Promise.all([prisma.vipRewardPool.findMany({ orderBy: { month: "desc" }, include: { _count: { select: { allocations: true } }, allocations: { select: { finalAmount: true, status: true } } } }), getSiteSettings()]);
  return (
    <>
      <PageTitle title="VIP monthly rewards" />
      <Section title="Create / update a month">
        <p className="mb-3 text-sm text-slate-600">
          Enter the month&apos;s <strong>eligible profit</strong> as approved by OceanX (not gross revenue) and the reward percentage. Pool = profit × %. Example: MVR 200 × 20% = MVR 40.
          Current formula: <strong>{settings.rewards.method === "equal" ? "equal split" : `weighted (deals ${settings.rewards.weights.deals}, listings ${settings.rewards.weights.listings}, referrals ${settings.rewards.weights.referrals}, stars ${settings.rewards.weights.stars})`}</strong> — <Link href="/admin/settings#rewards" className="underline">change formula</Link>.
        </p>
        <ActionForm action={savePoolAction}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Month" name="month"><input id="month" name="month" type="month" required defaultValue={currentMonth()} className="input" /></Field>
            <Field label="Eligible monthly profit (MVR)" name="eligibleProfit"><input id="eligibleProfit" name="eligibleProfit" required inputMode="decimal" className="input" /></Field>
            <Field label="VIP reward percentage" name="rewardPercent"><input id="rewardPercent" name="rewardPercent" type="number" min={0} max={100} step="0.1" required defaultValue={settings.rewards.defaultPercent} className="input" /></Field>
          </div>
          <Field label="How was the profit determined? (kept on record)" name="profitNote"><textarea id="profitNote" name="profitNote" rows={2} className="input" /></Field>
          <SubmitButton>Save pool</SubmitButton>
        </ActionForm>
      </Section>
      <div className="card p-2">
        <TableWrap>
          <table className="table">
            <thead><tr><th>Month</th><th>Eligible profit</th><th>%</th><th>Pool</th><th>Allocated</th><th>VIPs</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {pools.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold">{p.month}</td>
                  <td>{formatMVR(p.eligibleProfit)}</td>
                  <td>{p.rewardPercent}%</td>
                  <td>{formatMVR(p.poolAmount)}</td>
                  <td>{formatMVR(p.allocations.filter((a) => a.status !== "WITHHELD").reduce((s, a) => s + a.finalAmount, 0))}</td>
                  <td>{p._count.allocations}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td><Link href={`/admin/rewards/${p.id}`} className="btn-primary btn-sm">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </>
  );
}
