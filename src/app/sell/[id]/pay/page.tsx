import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { quotePostingFee } from "@/lib/services/fees";
import { getSiteSettings } from "@/lib/site";
import { formatMVR } from "@/lib/money";
import { BankDetails, PaymentForm } from "@/components/PaymentForm";

export const metadata = { title: "Pay posting fee" };

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireVerifiedUser(`/sell/${id}/pay`);
  const l = await prisma.listing.findUnique({ where: { id }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!l || l.sellerId !== user.id) notFound();
  if (l.status === "DRAFT") redirect(`/sell/${id}/preview`);
  if (l.status === "PAYMENT_REVIEW") redirect("/account/payments");
  if (!["PENDING_PAYMENT", "REJECTED"].includes(l.status)) redirect(`/listing/${id}`);
  const [quote, settings] = await Promise.all([quotePostingFee(user.id, { businessId: l.businessId, excludeListingId: l.id }), getSiteSettings()]);
  const lastRejected = l.payments[0]?.status === "REJECTED" ? l.payments[0] : null;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Pay posting fee</h1>
      <p className="text-sm text-slate-600">
        For <Link href={`/listing/${id}`} className="font-medium text-ocean-700">{l.title}</Link>
      </p>
      <div className="rounded-2xl bg-ocean-50 p-4 ring-1 ring-ocean-100">
        {quote.isVipRate ? (
          <p className="font-semibold">★ {settings.vip.badgeName} posting fee: {formatMVR(quote.amount)} <span className="text-sm font-normal text-slate-500">(normal {formatMVR(quote.normalFee)})</span></p>
        ) : (
          <p className="font-semibold">Normal posting fee: {formatMVR(quote.amount)}</p>
        )}
      </div>
      {lastRejected && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          We couldn&apos;t verify your previous payment{lastRejected.rejectionReason ? `: ${lastRejected.rejectionReason}` : "."} Please upload a new slip.
        </div>
      )}
      <BankDetails payment={settings.payment} amount={quote.amount} />
      <div className="card p-4">
        <PaymentForm purpose="LISTING_FEE" targetId={l.id} />
      </div>
    </div>
  );
}
