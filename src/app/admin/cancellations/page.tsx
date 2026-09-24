import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatMVR } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { FilterLinks, PageTitle } from "@/components/admin/ui";
import { cancellationAction } from "@/app/actions/admin";

export default async function AdminCancellationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage("cancellations");
  const sp = await searchParams;
  const filters: { value: string; label: string; where: Prisma.CancellationRecordWhereInput }[] = [
    { value: "", label: "Exception requests", where: { outcome: "EXCEPTION_REQUESTED" } },
    { value: "unpaid", label: "Unpaid fines", where: { fine: { status: "UNPAID" } } },
    { value: "all", label: "All", where: {} },
  ];
  const f = filters.find((x) => x.value === (sp.status ?? "")) ?? filters[0];
  const records = await prisma.cancellationRecord.findMany({
    where: f.where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { listing: { select: { id: true, title: true, publishedAt: true } }, seller: { select: { id: true, name: true } }, fine: { include: { payment: true } }, admin: { select: { name: true } } },
  });
  return (
    <>
      <PageTitle title="Cancellations & fines" />
      <FilterLinks base="/admin/cancellations" current={f.value} options={filters} />
      <div className="space-y-3">
        {records.length === 0 && <p className="card p-6 text-center text-slate-500">Nothing here.</p>}
        {records.map((r) => (
          <div key={r.id} className="card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold"><Link href={`/listing/${r.listing.id}`} className="underline">{r.listing.title}</Link></p>
              <div className="flex gap-1">{r.fine && <StatusBadge status={r.fine.status} />}<span className="chip bg-slate-100">{r.outcome}</span></div>
            </div>
            <p className="text-slate-600">
              Seller <Link href={`/admin/users/${r.seller.id}`} className="underline">{r.seller.name}</Link> · listing {r.listingId} · withdrawn {formatDateTime(r.createdAt)} (published {formatDateTime(r.listing.publishedAt)})
            </p>
            <p>Fine: <strong>{formatMVR(r.fineAmount)}</strong> · Counts against seller: {r.countsAgainstSeller ? "yes" : "no"} · Stats: {r.statsEffect} · VIP: {r.vipEffect}</p>
            {r.reason && <p>Seller reason: {r.reason}</p>}
            {r.exceptionRequest && <p className="rounded-lg bg-amber-50 p-2">Exception request: {r.exceptionRequest}</p>}
            {r.adminReason && <p className="text-slate-600">Admin: {r.adminReason} ({r.admin?.name}, {formatDateTime(r.overriddenAt)})</p>}
            <ActionForm action={cancellationAction} className="mt-2">
              <input type="hidden" name="cancellationId" value={r.id} />
              <input name="reason" required className="input" placeholder="Admin reason (shown to seller)" />
              <div className="flex flex-wrap gap-1">
                {r.outcome === "EXCEPTION_REQUESTED" && <SubmitButton name="op" value="approve_exception" className="btn-primary btn-sm">Approve exception</SubmitButton>}
                {r.outcome === "EXCEPTION_REQUESTED" && <SubmitButton name="op" value="deny_exception" className="btn-danger btn-sm">Deny exception</SubmitButton>}
                {r.fine && !["PAID", "WAIVED"].includes(r.fine.status) && <SubmitButton name="op" value="waive_fine" className="btn-secondary btn-sm">Waive fine</SubmitButton>}
                {r.countsAgainstSeller && <SubmitButton name="op" value="mark_exceptional" className="btn-secondary btn-sm">Mark exceptional (no penalty)</SubmitButton>}
                {!r.countsAgainstSeller && <SubmitButton name="op" value="reinstate" className="btn-ghost btn-sm">Count against seller again</SubmitButton>}
              </div>
            </ActionForm>
          </div>
        ))}
      </div>
    </>
  );
}
