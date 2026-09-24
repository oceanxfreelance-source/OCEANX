import Link from "next/link";
import type { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatMVR } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { FilterLinks, PageTitle, TableWrap } from "@/components/admin/ui";

const FILTERS: { value: string; label: string; statuses: PaymentStatus[] }[] = [
  { value: "", label: "Needs action", statuses: ["NEEDS_REVIEW", "PENDING", "AI_CHECKING"] },
  { value: "NEEDS_REVIEW", label: "Flagged", statuses: ["NEEDS_REVIEW"] },
  { value: "PENDING", label: "Clean", statuses: ["PENDING"] },
  { value: "VERIFIED", label: "Verified", statuses: ["VERIFIED"] },
  { value: "REJECTED", label: "Rejected", statuses: ["REJECTED"] },
  { value: "REFUNDED", label: "Refunded", statuses: ["REFUNDED"] },
  { value: "CANCELLED", label: "Cancelled", statuses: ["CANCELLED"] },
];

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdminPage("payments");
  const sp = await searchParams;
  const f = FILTERS.find((x) => x.value === (sp.status ?? "")) ?? FILTERS[0];
  const q = (sp.q ?? "").trim();
  const [payments, counts] = await Promise.all([
    prisma.payment.findMany({
      where: { status: { in: f.statuses }, ...(q ? { OR: [{ referenceNumber: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }, { id: q }] } : {}) },
      orderBy: { createdAt: f.value === "" ? "asc" : "desc" },
      take: 200,
      include: { user: { select: { name: true, email: true } }, listing: { select: { title: true } } },
    }),
    prisma.payment.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (statuses: PaymentStatus[]) => counts.filter((c) => statuses.includes(c.status)).reduce((a, c) => a + c._count, 0);
  return (
    <>
      <PageTitle title="Payment verification" />
      <FilterLinks base="/admin/payments" current={f.value} options={FILTERS.map((x) => ({ value: x.value, label: x.label, count: count(x.statuses) }))} />
      <form className="flex gap-2">
        <input type="hidden" name="status" value={f.value} />
        <input name="q" defaultValue={q} className="input" placeholder="Search reference, email or payment ID" />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card p-2">
        <TableWrap>
          <table className="table">
            <thead><tr><th>Submitted</th><th>Customer</th><th>For</th><th>Amount</th><th>Reference</th><th>Status</th><th>Flags</th><th></th></tr></thead>
            <tbody>
              {payments.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-500">Nothing to review.</td></tr>}
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{formatDateTime(p.createdAt)}</td>
                  <td>{p.user.name}<span className="block text-xs text-slate-500">{p.user.email}</span></td>
                  <td className="max-w-48 truncate">{p.purpose === "LISTING_FEE" ? p.listing?.title ?? "Listing" : p.purpose === "CANCELLATION_FINE" ? "Cancellation fine" : "Business plan"}</td>
                  <td className="whitespace-nowrap font-semibold">{formatMVR(p.amount)}{p.isVipRate && <span className="block text-xs text-amber-700">VIP rate</span>}</td>
                  <td className="font-mono text-xs">{p.referenceNumber}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="text-xs text-amber-800">{p.flags.length ? p.flags.join(", ") : "—"}</td>
                  <td><Link href={`/admin/payments/${p.id}`} className="btn-primary btn-sm">Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </>
  );
}
