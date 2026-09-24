import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatMVR } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageTitle, Section, Stat, TableWrap } from "@/components/admin/ui";
import { poolAction, allocationAction } from "@/app/actions/admin";

export default async function AdminPoolPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("rewards");
  const { id } = await params;
  const pool = await prisma.vipRewardPool.findUnique({
    where: { id },
    include: { allocations: { orderBy: { finalAmount: "desc" }, include: { user: { select: { id: true, name: true, email: true } }, payments: true } } },
  });
  if (!pool) notFound();
  const audits = await prisma.auditLog.findMany({ where: { OR: [{ entityId: id }, { entityId: { in: pool.allocations.map((a) => a.id) } }] }, orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: { name: true } } } });
  const allocated = pool.allocations.filter((a) => a.status !== "WITHHELD").reduce((s, a) => s + a.finalAmount, 0);
  const formula = pool.formula as { method?: string; weights?: Record<string, number> };
  const editable = pool.status === "CALCULATED";
  return (
    <>
      <PageTitle title={`VIP rewards — ${pool.month}`}><StatusBadge status={pool.status} /></PageTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Eligible profit" value={formatMVR(pool.eligibleProfit)} />
        <Stat label="Reward %" value={`${pool.rewardPercent}%`} />
        <Stat label="Reward pool" value={formatMVR(pool.poolAmount)} />
        <Stat label="Allocated" value={formatMVR(allocated)} sub={`${pool.allocations.length} eligible VIPs`} />
      </div>
      <Section title="Calculation">
        <p className="text-sm text-slate-600">
          Formula: <strong>{formula.method}</strong> {formula.weights && `(${Object.entries(formula.weights).map(([k, v]) => `${k} ×${v}`).join(", ")})`}
          {pool.profitNote && <><br />Profit note: {pool.profitNote}</>}
          {pool.calculatedAt && <><br />Calculated {formatDateTime(pool.calculatedAt)}</>}
          {pool.approvedAt && <><br />Approved {formatDateTime(pool.approvedAt)}</>}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(pool.status === "DRAFT" || pool.status === "CALCULATED") && (
            <ActionForm action={poolAction}><input type="hidden" name="poolId" value={pool.id} /><SubmitButton name="op" value="calculate" className="btn-secondary">{pool.status === "DRAFT" ? "Calculate rewards" : "Recalculate (resets adjustments)"}</SubmitButton></ActionForm>
          )}
          {pool.status === "CALCULATED" && (
            <ActionForm action={poolAction}><input type="hidden" name="poolId" value={pool.id} /><SubmitButton name="op" value="approve" className="btn-primary" confirm="Approve and finalise these rewards? VIPs will be notified.">Approve rewards</SubmitButton></ActionForm>
          )}
          <Link href="/admin/rewards" className="btn-ghost">Edit profit / %</Link>
        </div>
      </Section>
      <div className="card p-2">
        <TableWrap>
          <table className="table">
            <thead><tr><th>VIP</th><th>Metrics</th><th>Score</th><th>Calculated</th><th>Adjustment</th><th>Final</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {pool.allocations.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-500">{pool.status === "DRAFT" ? "Not calculated yet." : "No eligible VIP users for this month."}</td></tr>}
              {pool.allocations.map((a) => {
                const m = a.metrics as Record<string, number>;
                return (
                  <tr key={a.id}>
                    <td><Link href={`/admin/users/${a.user.id}`} className="underline">{a.user.name}</Link><span className="block text-xs text-slate-500">{a.user.email}</span></td>
                    <td className="text-xs">deals {m.deals} · listings {m.listings} · referrals {m.referrals} · stars {m.stars}</td>
                    <td>{a.score.toFixed(1)}</td>
                    <td>{formatMVR(a.calculatedAmount)}</td>
                    <td>{formatMVR(a.adjustment)}{a.adjustmentReason && <span className="block text-xs text-slate-500">{a.adjustmentReason}</span>}</td>
                    <td className="font-semibold">{formatMVR(a.finalAmount)}</td>
                    <td><StatusBadge status={a.status} />{a.payments[0] && <span className="block text-xs text-slate-500">{formatDate(a.payments[0].paidAt)} {a.payments[0].reference}</span>}</td>
                    <td className="min-w-64">
                      {editable && (
                        <ActionForm action={allocationAction}>
                          <input type="hidden" name="poolId" value={pool.id} />
                          <input type="hidden" name="allocationId" value={a.id} />
                          <div className="flex gap-1"><input name="adjustment" className="input" placeholder="± MVR" defaultValue={a.adjustment ? a.adjustment / 100 : ""} /><input name="reason" className="input" placeholder="Reason" /></div>
                          <div className="flex gap-1">
                            <SubmitButton name="op" value="adjust" className="btn-secondary btn-sm">Adjust</SubmitButton>
                            <SubmitButton name="op" value="withhold" className="btn-ghost btn-sm">Withhold</SubmitButton>
                          </div>
                        </ActionForm>
                      )}
                      {a.status === "APPROVED" && (
                        <ActionForm action={allocationAction}>
                          <input type="hidden" name="poolId" value={pool.id} />
                          <input type="hidden" name="allocationId" value={a.id} />
                          <div className="flex gap-1"><input name="method" className="input" placeholder="Method (e.g. BML transfer)" /><input name="reference" className="input" placeholder="Ref" /></div>
                          <input name="paidAt" type="date" className="input" />
                          <div className="flex gap-1">
                            <SubmitButton name="op" value="pay" className="btn-primary btn-sm">Mark paid</SubmitButton>
                            <input name="reason" className="input" placeholder="Reason to withhold" />
                            <SubmitButton name="op" value="withhold" className="btn-ghost btn-sm">Withhold</SubmitButton>
                          </div>
                        </ActionForm>
                      )}
                      {a.status === "WITHHELD" && pool.status !== "DRAFT" && (
                        <ActionForm action={allocationAction}>
                          <input type="hidden" name="poolId" value={pool.id} />
                          <input type="hidden" name="allocationId" value={a.id} />
                          <input name="reason" className="input" placeholder="Reason" required />
                          <SubmitButton name="op" value="release" className="btn-secondary btn-sm">Release</SubmitButton>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </div>
      <Section title="Audit history">
        <ul className="divide-y divide-slate-100 text-xs">
          {audits.map((a) => <li key={a.id} className="py-1">{formatDateTime(a.createdAt)} · {a.actor?.name ?? "system"} · {a.action} · {a.summary}</li>)}
        </ul>
      </Section>
    </>
  );
}
