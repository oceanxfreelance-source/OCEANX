import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { getSiteSettings } from "@/lib/site";
import { formatDate } from "@/lib/dates";
import { formatMVR } from "@/lib/money";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { FilterLinks, PageTitle, Section, Stat, TableWrap } from "@/components/admin/ui";
import { runVipMaintenanceAction, recomputeAllStatsAction, vipAction } from "@/app/actions/admin";

const DAY = 86400000;

export default async function AdminVipPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireAdminPage("vip");
  const sp = await searchParams;
  const settings = await getSiteSettings();
  const now = new Date();
  const views: Record<string, { label: string; where: Prisma.VipStatusWhereInput }> = {
    active: { label: "Active", where: { state: "ACTIVE", expiresAt: { gt: now } } },
    expiring: { label: "Expiring ≤14d", where: { state: "ACTIVE", expiresAt: { gt: now, lte: new Date(now.getTime() + 14 * DAY) } } },
    expired: { label: "Recently expired", where: { state: "EXPIRED", updatedAt: { gte: new Date(now.getTime() - 60 * DAY) } } },
    pending: { label: "Awaiting approval", where: { state: "PENDING_APPROVAL" } },
    suspended: { label: "Suspended", where: { state: "SUSPENDED" } },
  };
  const view = views[sp.view ?? ""] ? sp.view! : "active";
  const [counts, rows, totalEver, monthVipFees, lastPool, referrals] = await Promise.all([
    Promise.all(Object.entries(views).map(async ([k, v]) => [k, await prisma.vipStatus.count({ where: v.where })] as const)),
    prisma.vipStatus.findMany({ where: views[view].where, orderBy: { expiresAt: "asc" }, take: 200, include: { user: { select: { id: true, name: true, email: true, sellerStats: true, _count: { select: { referralsMade: { where: { status: "VERIFIED" } } } } } } } }),
    prisma.vipHistory.groupBy({ by: ["userId"], where: { event: { in: ["GRANTED", "APPROVED"] } } }),
    prisma.payment.aggregate({ where: { status: "VERIFIED", isVipRate: true, verifiedAt: { gte: new Date(now.getTime() - 30 * DAY) } }, _count: true, _sum: { amount: true } }),
    prisma.vipRewardPool.findFirst({ orderBy: { month: "desc" }, include: { allocations: { select: { finalAmount: true, status: true } } } }),
    prisma.referral.count({ where: { status: "VERIFIED", referrer: { vipStatus: { state: "ACTIVE" } } } }),
  ]);
  const c = Object.fromEntries(counts);
  return (
    <>
      <PageTitle title={`${settings.vip.badgeName} management`}>
        <div className="flex gap-2">
          <ActionForm action={runVipMaintenanceAction}><SubmitButton className="btn-secondary btn-sm">Run expiry / renewal check</SubmitButton></ActionForm>
          <ActionForm action={recomputeAllStatsAction}><SubmitButton className="btn-ghost btn-sm">Recalculate all stats</SubmitButton></ActionForm>
        </div>
      </PageTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Users who ever earned VIP" value={totalEver.length} />
        <Stat label="Active VIP" value={c.active} />
        <Stat label="Expiring in 14 days" value={c.expiring} />
        <Stat label="Recently expired" value={c.expired} />
        <Stat label="Awaiting approval" value={c.pending} />
        <Stat label="Suspended" value={c.suspended} />
        <Stat label="VIP-rate posting fees (30d)" value={monthVipFees._count} sub={formatMVR(monthVipFees._sum.amount ?? 0)} />
        <Stat label="Verified referrals by active VIPs" value={referrals} />
      </div>
      {lastPool && (
        <Section title={`Latest reward pool: ${lastPool.month}`} actions={<Link href={`/admin/rewards/${lastPool.id}`} className="btn-secondary btn-sm">Open</Link>}>
          <p className="text-sm">
            Pool {formatMVR(lastPool.poolAmount)} ({lastPool.rewardPercent}% of {formatMVR(lastPool.eligibleProfit)}) · {lastPool.allocations.length} VIPs · <StatusBadge status={lastPool.status} />
          </p>
        </Section>
      )}
      <Section title="Requirements">
        <p className="text-sm text-slate-600">
          {settings.vip.minStars} Stars · {settings.vip.minDealsTotal} deals total · {settings.vip.minDealsInWindow} deals in {settings.vip.windowDays} days · max {settings.vip.maxCancellationsInWindow} cancellations · lasts {settings.vip.durationMonths} months ·{" "}
          {settings.vip.requireAdminApproval ? "admin approval required" : "automatic"} · <Link href="/admin/settings#vip" className="underline">edit</Link>
        </p>
      </Section>
      <FilterLinks base="/admin/vip" param="view" current={view} options={Object.entries(views).map(([k, v]) => ({ value: k, label: v.label, count: c[k] }))} />
      <div className="card p-2">
        <TableWrap>
          <table className="table">
            <thead><tr><th>User</th><th>State</th><th>Since</th><th>Expires</th><th>Stars</th><th>Deals (recent)</th><th>Referrals</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.userId}>
                  <td><Link href={`/admin/users/${v.userId}`} className="underline">{v.user.name}</Link><span className="block text-xs text-slate-500">{v.user.email}</span></td>
                  <td><StatusBadge status={v.state} />{v.suspendedReason && <span className="block text-xs text-red-700">{v.suspendedReason}</span>}</td>
                  <td>{formatDate(v.since)}</td>
                  <td>{formatDate(v.expiresAt)}{v.renewals > 0 && <span className="block text-xs text-slate-500">renewed {v.renewals}×</span>}</td>
                  <td>{v.user.sellerStats?.stars ?? 0}</td>
                  <td>{v.user.sellerStats?.countedDeals ?? 0} ({v.user.sellerStats?.countedDealsInWindow ?? 0})</td>
                  <td>{v.user._count.referralsMade}</td>
                  <td className="min-w-56">
                    <ActionForm action={vipAction}>
                      <input type="hidden" name="userId" value={v.userId} />
                      <input name="reason" className="input" placeholder="Reason" />
                      <div className="flex flex-wrap gap-1">
                        {v.state === "PENDING_APPROVAL" && <SubmitButton name="op" value="approve" className="btn-primary btn-sm">Approve</SubmitButton>}
                        {v.state === "PENDING_APPROVAL" && <SubmitButton name="op" value="reject" className="btn-ghost btn-sm">Reject</SubmitButton>}
                        {v.state === "ACTIVE" && <SubmitButton name="op" value="suspend" className="btn-danger btn-sm">Suspend</SubmitButton>}
                        {["SUSPENDED", "EXPIRED"].includes(v.state) && <SubmitButton name="op" value="restore" className="btn-secondary btn-sm">Restore</SubmitButton>}
                      </div>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </>
  );
}
