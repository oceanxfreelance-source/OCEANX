import Link from "next/link";
import type { DealStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatMVR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { FilterLinks, PageTitle, TableWrap } from "@/components/admin/ui";
import { dealAction } from "@/app/actions/admin";

export default async function AdminDealsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage("vip");
  const sp = await searchParams;
  const opts: { value: string; label: string; where: Prisma.SuccessfulDealWhereInput }[] = [
    { value: "", label: "Disputed", where: { status: "DISPUTED" } },
    { value: "pending", label: "Awaiting buyer", where: { status: "PENDING_CONFIRMATION" } },
    { value: "ineligible", label: "Not counted", where: { countsTowardStats: false, status: { not: "VOIDED" } } },
    { value: "confirmed", label: "Confirmed", where: { status: "CONFIRMED" as DealStatus } },
    { value: "all", label: "All", where: {} },
  ];
  const cur = opts.find((o) => o.value === (sp.status ?? "")) ?? opts[0];
  const deals = await prisma.successfulDeal.findMany({ where: cur.where, orderBy: { createdAt: "desc" }, take: 200, include: { listing: { select: { id: true, title: true } }, seller: { select: { id: true, name: true } }, buyer: { select: { id: true, name: true } } } });
  return (
    <>
      <PageTitle title="Successful deals" />
      <p className="text-sm text-slate-600">Deals drive Stars and VIP. Review disputes and suspicious patterns here — every change is audited and stats are recalculated.</p>
      <FilterLinks base="/admin/deals" current={cur.value} options={opts} />
      <div className="card p-2">
        <TableWrap>
          <table className="table">
            <thead><tr><th>Listing</th><th>Seller → Buyer</th><th>Price</th><th>Status</th><th>Counts?</th><th>Date</th><th>Review</th></tr></thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id}>
                  <td className="max-w-48"><Link href={`/listing/${d.listing.id}`} className="underline">{d.listing.title}</Link></td>
                  <td><Link href={`/admin/users/${d.seller.id}`} className="underline">{d.seller.name}</Link> → {d.buyer ? <Link href={`/admin/users/${d.buyer.id}`} className="underline">{d.buyer.name}</Link> : "—"}</td>
                  <td>{formatMVR(d.price)}</td>
                  <td><StatusBadge status={d.status} />{d.disputedReason && <span className="block text-xs text-red-700">{d.disputedReason}</span>}</td>
                  <td className="text-xs">{d.countsTowardStats ? "Yes" : `No — ${d.ineligibleReason ?? d.voidReason ?? ""}`}</td>
                  <td className="whitespace-nowrap">{formatDate(d.createdAt)}</td>
                  <td className="min-w-56">
                    <ActionForm action={dealAction}>
                      <input type="hidden" name="dealId" value={d.id} />
                      <input name="reason" required className="input" placeholder="Reason" />
                      <div className="flex flex-wrap gap-1">
                        {d.status !== "CONFIRMED" && d.status !== "VOIDED" && <SubmitButton name="op" value="confirm" className="btn-primary btn-sm">Confirm</SubmitButton>}
                        {d.status !== "VOIDED" && <SubmitButton name="op" value="void" className="btn-danger btn-sm">Void</SubmitButton>}
                        {!d.countsTowardStats && d.status !== "VOIDED" && <SubmitButton name="op" value="count" className="btn-secondary btn-sm">Count it</SubmitButton>}
                        {d.countsTowardStats && <SubmitButton name="op" value="exclude" className="btn-ghost btn-sm">Exclude</SubmitButton>}
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
