import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { formatMVR } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { fileUrl } from "@/lib/storage";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { EmptyState } from "@/components/ListingCard";
import { cancelPaymentAction } from "@/app/actions/sell";

export const metadata = { title: "Payments" };

const purposeLabel = { LISTING_FEE: "Posting fee", CANCELLATION_FINE: "Cancellation fee", BUSINESS_SUBSCRIPTION: "Business plan" } as const;
// Customers see neutral wording; internal screening flags are never shown to them.
const userStatus = { AI_CHECKING: "Checking", PENDING: "Under review", NEEDS_REVIEW: "Under review", VERIFIED: "Verified", REJECTED: "Not verified", REFUNDED: "Refunded", CANCELLED: "Cancelled" } as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/account/payments");
  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { listing: { select: { id: true, title: true } }, slips: { take: 1, orderBy: { createdAt: "desc" } } },
  });
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Payments</h1>
      {sp.submitted && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Thanks! Your payment slip was received. We&apos;ll notify you as soon as it&apos;s verified.</p>}
      {payments.length === 0 && <EmptyState title="No payments yet" />}
      <ul className="space-y-3">
        {payments.map((p) => (
          <li key={p.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                {purposeLabel[p.purpose]} · {formatMVR(p.amount)} {p.isVipRate && <span className="chip bg-amber-100 text-amber-800">VIP rate</span>}
              </p>
              <StatusBadge status={p.status === "NEEDS_REVIEW" ? "PENDING" : p.status} labels={userStatus} />
            </div>
            {p.listing && <Link href={`/listing/${p.listing.id}`} className="text-sm text-ocean-700">{p.listing.title}</Link>}
            <p className="text-xs text-slate-500">Ref {p.referenceNumber} · submitted {formatDateTime(p.createdAt)}</p>
            {p.status === "REJECTED" && p.rejectionReason && <p className="mt-1 text-sm text-red-700">Reason: {p.rejectionReason}</p>}
            {p.status === "REFUNDED" && p.refundNote && <p className="mt-1 text-sm text-slate-600">{p.refundNote}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {p.slips[0] && <a href={fileUrl(p.slips[0].fileId)!} target="_blank" className="btn-secondary btn-sm">View slip</a>}
              {p.status === "REJECTED" && p.listing && <Link href={`/sell/${p.listing.id}/pay`} className="btn-accent btn-sm">Upload new slip</Link>}
              {["PENDING", "NEEDS_REVIEW"].includes(p.status) && (
                <ActionForm action={cancelPaymentAction}>
                  <input type="hidden" name="paymentId" value={p.id} />
                  <SubmitButton className="btn-ghost btn-sm" confirm="Cancel this payment submission?">Cancel submission</SubmitButton>
                </ActionForm>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
