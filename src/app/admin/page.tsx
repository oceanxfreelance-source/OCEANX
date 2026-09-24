import { requireAdminPage } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions";
import { revenueDashboard, marketplaceStats, dailyRevenue } from "@/lib/services/analytics";
import { formatMVR } from "@/lib/money";
import { PageTitle, Section, Stat } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { revenueEntryAction } from "@/app/actions/admin";

export default async function AdminDashboard() {
  const { permissions } = await requireAdminPage("dashboard");
  const canFinance = hasPermission(permissions, "finance");
  const [stats, revenue, daily] = await Promise.all([marketplaceStats(), canFinance ? revenueDashboard() : null, canFinance ? dailyRevenue(30) : null]);
  const max = Math.max(1, ...(daily ?? []).map((d) => d.amount));
  return (
    <>
      <PageTitle title="Dashboard" />
      {revenue && (
        <Section title="Revenue">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Today" value={formatMVR(revenue.today.total)} />
            <Stat label="Last 7 days" value={formatMVR(revenue.week.total)} />
            <Stat label="This month" value={formatMVR(revenue.month.total)} />
            <Stat label="This year" value={formatMVR(revenue.year.total)} />
            <Stat label="All time" value={formatMVR(revenue.total.total)} />
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Source</th><th>Today</th><th>7 days</th><th>Month</th><th>Year</th><th>Total</th></tr>
              </thead>
              <tbody>
                {([["Posting fees", "posting"], ["Business subscriptions", "subscriptions"], ["Cancellation fines", "fines"], ["Other (recorded)", "other"]] as const).map(([label, k]) => (
                  <tr key={k}>
                    <td className="font-medium">{label}</td>
                    <td>{formatMVR(revenue.today[k])}</td>
                    <td>{formatMVR(revenue.week[k])}</td>
                    <td>{formatMVR(revenue.month[k])}</td>
                    <td>{formatMVR(revenue.year[k])}</td>
                    <td>{formatMVR(revenue.total[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Refunds" value={formatMVR(revenue.refunds.amount)} sub={`${revenue.refunds.count} payments`} />
            <Stat label="VIP rewards paid" value={formatMVR(revenue.vipRewards.paid)} />
            <Stat label="VIP rewards approved, unpaid" value={formatMVR(revenue.vipRewards.approvedUnpaid)} />
          </div>
          {daily && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Verified revenue — last 30 days</p>
              <div className="flex h-32 items-end gap-0.5" role="img" aria-label="Daily revenue chart">
                {daily.map((d) => (
                  <div key={d.day} className="group relative flex-1">
                    <div className="rounded-t bg-ocean-600" style={{ height: `${Math.max(2, (d.amount / max) * 120)}px` }} />
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
                      {d.day}: {formatMVR(d.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-ocean-700">Record other revenue / adjustment</summary>
            <ActionForm action={revenueEntryAction} className="mt-2 grid gap-2 sm:grid-cols-4" resetOnSuccess>
              <input name="category" className="input" placeholder="Category (e.g. Advertising)" required />
              <input name="amount" className="input" placeholder="Amount MVR (negative for costs)" required />
              <input name="occurredAt" type="date" className="input" />
              <input name="note" className="input" placeholder="Note" />
              <SubmitButton className="btn-primary sm:col-span-4">Record</SubmitButton>
            </ActionForm>
          </details>
        </Section>
      )}
      <Section title="Marketplace">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <Stat label="Users" value={stats.users} />
          <Stat label="Active users (30d)" value={stats.activeUsers} />
          <Stat label="Listings (published ever)" value={stats.listings} />
          <Stat label="Active listings" value={stats.activeListings} />
          <Stat label="Sold listings" value={stats.soldListings} />
          <Stat label="Listings created today" value={stats.todayListings} />
          <Stat label="Businesses" value={stats.businesses} />
          <Stat label="Active subscriptions" value={stats.activeSubs} />
          <Stat label="Pending payments" value={stats.pendingPayments} />
          <Stat label="Open reports" value={stats.pendingReports} />
          <Stat label="Suspended users" value={stats.suspendedUsers} />
          <Stat label="VIP users" value={stats.vipUsers} />
          <Stat label="Successful deals" value={stats.deals} />
        </div>
      </Section>
    </>
  );
}
