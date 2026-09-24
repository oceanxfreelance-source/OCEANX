import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatMVR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { StatusBadge, VerifiedBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageTitle, Section, TableWrap } from "@/components/admin/ui";
import { businessAdminAction, savePlanAction } from "@/app/actions/admin";

type Plan = { id: string; name: string; description: string | null; price: number; durationDays: number; freeListingsPerPeriod: number; featuredSlots: number; features: string[]; isActive: boolean; sortOrder: number };

function PlanForm({ p }: { p?: Plan }) {
  return (
    <ActionForm action={savePlanAction}>
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <div className="grid gap-2 sm:grid-cols-4">
        <input name="name" defaultValue={p?.name} required className="input sm:col-span-2" placeholder="Plan name" />
        <label className="text-xs">Price (MVR)<input name="price" defaultValue={p ? p.price / 100 : ""} required className="input" /></label>
        <label className="text-xs">Duration (days)<input name="durationDays" type="number" defaultValue={p?.durationDays ?? 30} className="input" /></label>
        <label className="text-xs">Fee-free listings / period<input name="freeListingsPerPeriod" type="number" defaultValue={p?.freeListingsPerPeriod ?? 0} className="input" /></label>
        <label className="text-xs">Featured slots<input name="featuredSlots" type="number" defaultValue={p?.featuredSlots ?? 0} className="input" /></label>
        <label className="text-xs">Order<input name="sortOrder" type="number" defaultValue={p?.sortOrder ?? 0} className="input" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={p?.isActive ?? true} className="h-4 w-4" /> Available</label>
        <input name="description" defaultValue={p?.description ?? ""} className="input sm:col-span-4" placeholder="Short description" />
        <textarea name="features" defaultValue={p?.features.join("\n")} rows={3} className="input sm:col-span-4" placeholder="Features (one per line)" />
      </div>
      <SubmitButton className="btn-primary btn-sm">{p ? "Save plan" : "Add plan"}</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminBusinessesPage() {
  await requireAdminPage("businesses");
  const now = new Date();
  const [businesses, plans, pendingSubs] = await Promise.all([
    prisma.business.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { owner: { select: { id: true, name: true } }, subscriptions: { where: { status: "ACTIVE", endsAt: { gt: now } }, include: { plan: true }, take: 1 }, _count: { select: { listings: true } } } }),
    prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: { where: { status: "ACTIVE", endsAt: { gt: now } } } } } } }),
    prisma.businessSubscription.count({ where: { status: "PENDING_PAYMENT" } }),
  ]);
  return (
    <>
      <PageTitle title="Businesses & subscriptions" />
      <p className="text-sm text-slate-600">{pendingSubs} subscription(s) awaiting payment. Subscription payments are verified in <Link href="/admin/payments" className="underline">Payments</Link>.</p>
      <div className="card p-2">
        <TableWrap>
          <table className="table">
            <thead><tr><th>Business</th><th>Owner</th><th>Plan</th><th>Listings</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id}>
                  <td><Link href={`/business/${b.slug}`} className="font-medium underline">{b.name}</Link> {b.verified && <VerifiedBadge />}<span className="block text-xs text-slate-500">since {formatDate(b.createdAt)}</span></td>
                  <td><Link href={`/admin/users/${b.owner.id}`} className="underline">{b.owner.name}</Link></td>
                  <td>{b.subscriptions[0] ? <>{b.subscriptions[0].plan.name}<span className="block text-xs text-slate-500">until {formatDate(b.subscriptions[0].endsAt)}</span></> : "—"}</td>
                  <td>{b._count.listings}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="min-w-56">
                    <ActionForm action={businessAdminAction}>
                      <input type="hidden" name="businessId" value={b.id} />
                      <input name="reason" className="input" placeholder="Reason (for suspension)" />
                      <div className="flex flex-wrap gap-1">
                        <SubmitButton name="op" value={b.verified ? "unverify" : "verify"} className="btn-secondary btn-sm">{b.verified ? "Unverify" : "Verify"}</SubmitButton>
                        <SubmitButton name="op" value={b.status === "ACTIVE" ? "suspend" : "activate"} className={b.status === "ACTIVE" ? "btn-danger btn-sm" : "btn-primary btn-sm"}>{b.status === "ACTIVE" ? "Suspend" : "Activate"}</SubmitButton>
                      </div>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
      <h2 className="text-lg font-bold">Subscription plans</h2>
      {plans.map((p) => (
        <Section key={p.id} title={`${p.name} · ${formatMVR(p.price)} · ${p._count.subscriptions} active`}>
          <PlanForm p={p} />
        </Section>
      ))}
      <Section title="New plan"><PlanForm /></Section>
    </>
  );
}
