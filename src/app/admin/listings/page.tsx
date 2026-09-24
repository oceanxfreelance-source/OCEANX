import Link from "next/link";
import type { ListingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatMVR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { FilterLinks, PageTitle, TableWrap } from "@/components/admin/ui";
import { listingModerationAction } from "@/app/actions/admin";

const STATUSES: ListingStatus[] = ["PUBLISHED", "PAYMENT_REVIEW", "PENDING_PAYMENT", "DRAFT", "SOLD", "WITHDRAWN", "REMOVED", "REJECTED"];

export default async function AdminListingsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdminPage("listings");
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as ListingStatus) ? (sp.status as ListingStatus) : "PUBLISHED";
  const q = (sp.q ?? "").trim();
  const where: Prisma.ListingWhereInput = { status, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { id: q }, { seller: { email: { contains: q, mode: "insensitive" } } }] } : {}) };
  const [listings, counts] = await Promise.all([
    prisma.listing.findMany({ where, orderBy: { updatedAt: "desc" }, take: 200, include: { seller: { select: { id: true, name: true } }, category: { select: { name: true } }, _count: { select: { reports: true } } } }),
    prisma.listing.groupBy({ by: ["status"], _count: true }),
  ]);
  return (
    <>
      <PageTitle title="Listings" />
      <FilterLinks base="/admin/listings" current={status} options={STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ").toLowerCase(), count: counts.find((c) => c.status === s)?._count ?? 0 }))} />
      <form className="flex gap-2">
        <input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={q} className="input" placeholder="Search title, ID or seller email" />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card p-2">
        <TableWrap>
          <table className="table">
            <thead><tr><th>Listing</th><th>Seller</th><th>Price</th><th>Status</th><th>Reports</th><th>Updated</th><th>Moderate</th></tr></thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id}>
                  <td className="max-w-64"><Link href={`/listing/${l.id}`} className="font-medium underline">{l.title}</Link><span className="block text-xs text-slate-500">{l.category.name}</span></td>
                  <td><Link href={`/admin/users/${l.seller.id}`} className="underline">{l.seller.name}</Link></td>
                  <td>{formatMVR(l.price)}</td>
                  <td><StatusBadge status={l.status} />{l.removedReason && <span className="block text-xs text-red-700">{l.removedReason}</span>}</td>
                  <td>{l._count.reports}</td>
                  <td className="whitespace-nowrap">{formatDate(l.updatedAt)}</td>
                  <td className="min-w-56">
                    <ActionForm action={listingModerationAction}>
                      <input type="hidden" name="listingId" value={l.id} />
                      <input type="hidden" name="op" value={l.status === "REMOVED" ? "restore" : "remove"} />
                      <input name="reason" required className="input" placeholder="Reason (sent to seller)" />
                      <SubmitButton className={l.status === "REMOVED" ? "btn-secondary btn-sm" : "btn-danger btn-sm"}>{l.status === "REMOVED" ? "Restore" : "Remove (no fine)"}</SubmitButton>
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
