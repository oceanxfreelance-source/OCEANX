import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatMVR } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { fileUrl } from "@/lib/storage";
import { FLAG_LABELS } from "@/lib/services/payments";
import { getSiteSettings } from "@/lib/site";
import { StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageTitle, Section } from "@/components/admin/ui";
import { paymentDecisionAction } from "@/app/actions/admin";

export default async function AdminPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("payments");
  const { id } = await params;
  const [p, settings] = await Promise.all([
    prisma.payment.findUnique({
      where: { id },
      include: {
        user: { include: { sellerStats: true } },
        listing: { select: { id: true, title: true, status: true } },
        cancellationFine: { include: { cancellation: { include: { listing: { select: { title: true } } } } } },
        subscription: { include: { plan: true, business: true } },
        slips: { orderBy: { createdAt: "desc" }, include: { file: { select: { id: true, mimeType: true, size: true } } } },
        aiVerifications: { orderBy: { createdAt: "desc" } },
        reviewedBy: { select: { name: true } },
      },
    }),
    getSiteSettings(),
  ]);
  if (!p) notFound();
  const userHistory = await prisma.payment.groupBy({ by: ["status"], where: { userId: p.userId }, _count: true });
  const open = ["AI_CHECKING", "PENDING", "NEEDS_REVIEW"].includes(p.status);
  const slip = p.slips[0];
  return (
    <>
      <PageTitle title={`Payment ${formatMVR(p.amount)}`}>
        <StatusBadge status={p.status} />
      </PageTitle>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Payment slip">
          {slip ? (
            slip.file.mimeType === "application/pdf" ? (
              <a href={fileUrl(slip.file.id)!} target="_blank" className="btn-secondary">Open PDF slip ({Math.round(slip.file.size / 1024)} KB)</a>
            ) : (
              <a href={fileUrl(slip.file.id)!} target="_blank">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(slip.file.id)!} alt="Payment slip" className="max-h-[70vh] w-full rounded-xl bg-slate-100 object-contain" />
              </a>
            )
          ) : (
            <p>No slip.</p>
          )}
          {p.slips.length > 1 && <p className="mt-2 text-xs text-slate-500">{p.slips.length} slips uploaded for this payment.</p>}
          <p className="mt-2 break-all font-mono text-[10px] text-slate-400">sha256 {slip?.sha256}</p>
        </Section>

        <div className="space-y-4">
          <Section title="Details">
            <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
              <dt className="text-slate-500">Customer</dt>
              <dd><Link href={`/admin/users/${p.userId}`} className="text-ocean-700 underline">{p.user.name}</Link> · {p.user.email}</dd>
              <dt className="text-slate-500">For</dt>
              <dd>
                {p.purpose === "LISTING_FEE" && p.listing && <Link href={`/listing/${p.listing.id}`} className="underline">Posting fee: {p.listing.title}</Link>}
                {p.purpose === "CANCELLATION_FINE" && `Cancellation fine: ${p.cancellationFine?.cancellation.listing.title ?? ""}`}
                {p.purpose === "BUSINESS_SUBSCRIPTION" && `${p.subscription?.plan.name} for ${p.subscription?.business.name}`}
              </dd>
              <dt className="text-slate-500">Expected amount</dt>
              <dd className="font-semibold">{formatMVR(p.amount)} {p.isVipRate && "(VIP rate)"}</dd>
              <dt className="text-slate-500">Reference</dt>
              <dd className="font-mono">{p.referenceNumber ?? "— (read from slip if AI is enabled)"}</dd>
              <dt className="text-slate-500">Payment date</dt>
              <dd>{formatDate(p.paidAt)}</dd>
              <dt className="text-slate-500">Payer</dt>
              <dd>{[p.payerName, p.bankName, p.payerAccount].filter(Boolean).join(" · ") || "—"}</dd>
              <dt className="text-slate-500">Receiving account</dt>
              <dd>{settings.payment.bankName} {settings.payment.accountNumber}</dd>
              <dt className="text-slate-500">Customer note</dt>
              <dd>{p.userNote || "—"}</dd>
              <dt className="text-slate-500">Submitted</dt>
              <dd>{formatDateTime(p.createdAt)}</dd>
              <dt className="text-slate-500">Customer history</dt>
              <dd>{userHistory.map((h) => `${h._count} ${h.status.toLowerCase()}`).join(", ")}</dd>
              {p.reviewedBy && (
                <>
                  <dt className="text-slate-500">Reviewed by</dt>
                  <dd>{p.reviewedBy.name} · {formatDateTime(p.reviewedAt)} {p.reviewNote && `— ${p.reviewNote}`}</dd>
                </>
              )}
              {p.rejectionReason && (<><dt className="text-slate-500">Rejection</dt><dd>{p.rejectionReason}</dd></>)}
              {p.refundNote && (<><dt className="text-slate-500">Refund</dt><dd>{p.refundNote} ({formatDateTime(p.refundedAt)})</dd></>)}
            </dl>
          </Section>

          <Section title="Screening (assistance only)">
            {p.flags.length > 0 ? (
              <ul className="mb-3 space-y-1">
                {p.flags.map((f) => (
                  <li key={f} className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-900">{FLAG_LABELS[f] ?? f}</li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">No automatic flags.</p>
            )}
            {p.aiVerifications.map((a) => (
              <div key={a.id} className="mb-2 rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-medium">
                  {a.provider}{a.model ? ` · ${a.model}` : ""} · <StatusBadge status={a.status === "PASSED" ? "VERIFIED" : a.status === "FLAGGED" ? "NEEDS_REVIEW" : "CANCELLED"} labels={{ VERIFIED: "passed", NEEDS_REVIEW: "flagged", CANCELLED: a.status.toLowerCase() }} />
                  {a.confidence !== null && <span className="text-slate-500"> · confidence {(a.confidence * 100).toFixed(0)}%</span>}
                </p>
                <p className="text-slate-700">{a.summary}</p>
                {(a.extractedAmount !== null || a.extractedReference) && (
                  <p className="mt-1 text-xs text-slate-500">
                    Read from slip: amount {a.extractedAmount !== null ? formatMVR(a.extractedAmount) : "?"} · ref {a.extractedReference ?? "?"} · date {a.extractedDate ?? "?"} · to {a.extractedAccount ?? "?"} · from {a.extractedPayer ?? "?"}
                  </p>
                )}
                <p className="text-xs text-slate-400">{formatDateTime(a.createdAt)}</p>
              </div>
            ))}
            <p className="text-xs text-slate-500">Flags are hints for a human reviewer and never an accusation. Contact the customer if something is unclear.</p>
          </Section>

          <Section title="Decision">
            {open ? (
              <div className="space-y-3">
                <ActionForm action={paymentDecisionAction}>
                  <input type="hidden" name="paymentId" value={p.id} />
                  <textarea name="note" rows={2} className="input" placeholder={p.flags.length ? "Required: why are you verifying despite flags? / reason for rejection (shown to customer)" : "Note / reason (rejection reason is shown to the customer)"} />
                  <div className="grid grid-cols-2 gap-2">
                    <SubmitButton name="decision" value="verify" className="btn-primary">Verify & apply</SubmitButton>
                    <SubmitButton name="decision" value="reject" className="btn-danger" confirm="Reject this payment? The customer will be asked to upload a new slip.">Reject</SubmitButton>
                  </div>
                </ActionForm>
                <ActionForm action={paymentDecisionAction}>
                  <input type="hidden" name="paymentId" value={p.id} />
                  <SubmitButton name="decision" value="rescreen" className="btn-ghost btn-sm">↻ Re-run screening</SubmitButton>
                </ActionForm>
              </div>
            ) : p.status === "VERIFIED" ? (
              <ActionForm action={paymentDecisionAction}>
                <input type="hidden" name="paymentId" value={p.id} />
                <textarea name="note" rows={2} className="input" placeholder="Refund note (shown to customer)" required />
                <SubmitButton name="decision" value="refund" className="btn-secondary" confirm="Mark this payment as refunded?">Mark as refunded</SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-sm text-slate-500">No actions available.</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
