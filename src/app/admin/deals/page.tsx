import Link from "next/link";
import type { DealStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatMVR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { FilterLinks, PageTitle, TableWrap } from "@/components/admin/ui";
import { dealAction, saleProofAction } from "@/app/actions/admin";

export default async function AdminDealsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage("vip");
  const sp = await searchParams;
  const opts: { value: string; label: string; where: Prisma.SuccessfulDealWhereInput }[] = [
    { value: "", label: "Sold requests", where: { proofStatus: "PENDING" } },
    { value: "disputed", label: "Disputed", where: { status: "DISPUTED" } },
    { value: "pending", label: "Awaiting buyer", where: { status: "PENDING_CONFIRMATION" } },
    { value: "ineligible", label: "Not counted", where: { countsTowardStats: false, status: { not: "VOIDED" } } },
    { value: "confirmed", label: "Confirmed", where: { status: "CONFIRMED" as DealStatus } },
    { value: "all", label: "All", where: {} },
  ];
  const cur = opts.find((o) => o.value === (sp.status === "proof" ? "" : (sp.status ?? ""))) ?? opts[0];
  const deals = await prisma.successfulDeal.findMany({ where: cur.where, orderBy: { createdAt: "desc" }, take: 200, include: { listing: { select: { id: true, title: true, status: true, publishedAt: true } }, seller: { select: { id: true, name: true } }, buyer: { select: { id: true, name: true } }, proofs: { include: { file: { select: { id: true, mimeType: true } } }, orderBy: { createdAt: "asc" } } } });
  if (cur.value === "") {
    return (
      <>
        <PageTitle title="Successful deals" />
        <p className="text-sm text-slate-600">Sellers send a sold request with proof. Accepting it marks the listing <b>SOLD</b> automatically and the sale counts toward the seller&apos;s Stars and VIP. Rejecting keeps the listing live and asks the seller for better proof.</p>
        <FilterLinks base="/admin/deals" current={cur.value} options={opts} />
        {deals.length === 0 && <p className="card p-6 text-center text-sm text-slate-500">No sold requests waiting. 🎉</p>}
        <div className="space-y-4">
          {deals.map((d) => (
            <div key={d.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/listing/${d.listing.id}`} className="font-semibold underline">{d.listing.title}</Link>
                  <p className="text-sm text-slate-600">
                    {formatMVR(d.price)} · seller <Link href={`/admin/users/${d.seller.id}`} className="underline">{d.seller.name}</Link> → buyer{" "}
                    {d.buyer ? <Link href={`/admin/users/${d.buyer.id}`} className="underline">{d.buyer.name}</Link> : "outside MV Markets"}
                  </p>
                  <p className="text-xs text-slate-500">Requested {formatDate(d.createdAt)}{d.listing.publishedAt ? ` · listed ${formatDate(d.listing.publishedAt)}` : ""} · listing is {d.listing.status.toLowerCase()}</p>
                </div>
              </div>
              {d.proofNote && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><span className="font-medium">Seller&apos;s note:</span> {d.proofNote}</p>}
              {!d.countsTowardStats && d.ineligibleReason && <p className="mt-2 text-xs text-amber-800">Even if accepted, this sale won&apos;t add Stars: {d.ineligibleReason}</p>}
              <div className="mt-3 flex flex-wrap gap-3">
                {d.proofs.map((p) =>
                  p.file.mimeType === "application/pdf" ? (
                    <a key={p.id} href={`/api/files/${p.file.id}`} target="_blank" rel="noreferrer" className="grid h-40 w-32 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-ocean-700 underline">Open PDF</a>
                  ) : (
                    <a key={p.id} href={`/api/files/${p.file.id}`} target="_blank" rel="noreferrer" title="Open full size">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/files/${p.file.id}`} alt="Proof of sale" className="h-40 w-auto max-w-[16rem] rounded-lg border border-slate-200 object-cover" />
                    </a>
                  ),
                )}
              </div>
              <ActionForm action={saleProofAction} className="mt-4 space-y-2">
                <input type="hidden" name="dealId" value={d.id} />
                <input name="note" maxLength={500} className="input" placeholder="Note (required when rejecting — the seller sees it)" />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="decision" value="approve" className="btn-primary btn-sm">Accept · mark SOLD</SubmitButton>
                  <SubmitButton name="decision" value="reject" className="btn-danger btn-sm">Reject proof</SubmitButton>
                </div>
              </ActionForm>
            </div>
          ))}
        </div>
      </>
    );
  }
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
                  <td className="text-xs">
                    {d.proofStatus === "PENDING" || d.proofStatus === "REJECTED" ? `No — proof ${d.proofStatus === "PENDING" ? "waiting for review" : "rejected"}` : d.countsTowardStats ? "Yes" : `No — ${d.ineligibleReason ?? d.voidReason ?? ""}`}
                  </td>
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
