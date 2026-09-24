import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { getSiteSettings } from "@/lib/site";
import { formatMVR } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { EmptyState } from "@/components/ListingCard";
import { BankDetails, PaymentForm } from "@/components/PaymentForm";

export const metadata = { title: "Cancellation history" };

export default async function CancellationsPage({ searchParams }: { searchParams: Promise<{ withdrawn?: string; pay?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/account/cancellations");
  const [records, settings] = await Promise.all([
    prisma.cancellationRecord.findMany({ where: { sellerId: user.id }, orderBy: { createdAt: "desc" }, include: { listing: { select: { title: true } }, fine: true } }),
    getSiteSettings(),
  ]);
  const payFor = records.find((r) => r.fine?.id === sp.pay && r.fine?.status === "UNPAID");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Cancellation history</h1>
      {sp.withdrawn && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Your listing was withdrawn.</p>}
      {payFor?.fine && (
        <div className="card space-y-3 p-4">
          <h2 className="font-bold">Pay cancellation fee for “{payFor.listing.title}”</h2>
          <BankDetails payment={settings.payment} amount={payFor.fine.amount} />
          <PaymentForm purpose="CANCELLATION_FINE" targetId={payFor.fine.id} />
        </div>
      )}
      {records.length === 0 ? (
        <EmptyState title="No cancellations">Great job keeping your listings available!</EmptyState>
      ) : (
        <ul className="space-y-3">
          {records.map((r) => (
            <li key={r.id} className="card p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{r.listing.title}</p>
                {r.fine ? <StatusBadge status={r.fine.status} /> : <StatusBadge status="WAIVED" labels={{ WAIVED: "No fee" }} />}
              </div>
              <p className="text-slate-500">Listing {r.listingId.slice(-8)} · {formatDateTime(r.createdAt)}</p>
              <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                <div><dt className="inline text-slate-500">Fee: </dt><dd className="inline font-medium">{formatMVR(r.fineAmount)}</dd></div>
                <div><dt className="inline text-slate-500">Outcome: </dt><dd className="inline">{r.outcome.replace(/_/g, " ").toLowerCase()}</dd></div>
                {r.reason && <div className="sm:col-span-2"><dt className="inline text-slate-500">Your reason: </dt><dd className="inline">{r.reason}</dd></div>}
                <div><dt className="inline text-slate-500">Seller stats: </dt><dd className="inline">{r.statsEffect}</dd></div>
                <div><dt className="inline text-slate-500">VIP: </dt><dd className="inline">{r.vipEffect}</dd></div>
                {r.adminReason && <div className="sm:col-span-2"><dt className="inline text-slate-500">OceanX review: </dt><dd className="inline">{r.adminReason}</dd></div>}
              </dl>
              {r.fine?.status === "UNPAID" && (
                <Link href={`/account/cancellations?pay=${r.fine.id}`} className="btn-accent btn-sm mt-3">Pay {formatMVR(r.fine.amount)}</Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
