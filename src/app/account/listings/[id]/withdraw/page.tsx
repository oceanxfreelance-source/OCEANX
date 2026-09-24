import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { quoteCancellation } from "@/lib/services/cancellations";
import { formatMVR } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { withdrawAction } from "@/app/actions/sell";

export const metadata = { title: "Withdraw listing" };

export default async function WithdrawPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireVerifiedUser(`/account/listings/${id}/withdraw`);
  const l = await prisma.listing.findUnique({ where: { id } });
  if (!l || l.sellerId !== user.id) notFound();
  if (l.status !== "PUBLISHED") redirect("/account/listings");
  const q = await quoteCancellation(id, user.id);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Remove published listing</h1>
      <div className="card space-y-3 p-4">
        <p>
          You&apos;re about to remove this published listing: <strong>{l.title}</strong>
        </p>
        <div className={`rounded-xl p-4 text-center ${q.fine > 0 ? "bg-red-50 ring-1 ring-red-200" : "bg-emerald-50 ring-1 ring-emerald-200"}`}>
          <p className="text-sm text-slate-600">Cancellation fee</p>
          <p className={`text-3xl font-extrabold ${q.fine > 0 ? "text-red-700" : "text-emerald-700"}`}>{formatMVR(q.fine)}</p>
          {q.reason === "grace" && q.graceEndsAt && <p className="text-xs text-emerald-800">Free — you&apos;re within the grace period (until {formatDateTime(q.graceEndsAt)}).</p>}
          {q.reason === "disabled" && <p className="text-xs text-emerald-800">No cancellation fee currently applies.</p>}
        </div>
        <p className="text-sm text-slate-600">
          Did the item sell? <Link href={`/account/listings/${id}/sold`} className="font-semibold text-ocean-700 underline">Mark it as sold instead</Link> — that&apos;s always free and counts toward your Stars.
        </p>
        {q.consequences.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {q.consequences.map((c) => (
              <li key={c}>{c}</li>
            ))}
            <li>
              You have withdrawn {q.cancellationsInPeriod} published listing(s) in the last {q.periodDays} days (limit {q.maxPerPeriod}).
            </li>
          </ul>
        )}
      </div>
      <ActionForm action={withdrawAction} className="card p-4">
        <input type="hidden" name="listingId" value={l.id} />
        <input type="hidden" name="expectedFine" value={q.fine} />
        <div>
          <label className="label" htmlFor="reason">Reason (optional)</label>
          <textarea id="reason" name="reason" rows={2} maxLength={500} className="input" />
        </div>
        {q.fine > 0 && q.allowExceptionRequests && (
          <details className="rounded-xl bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-medium">Exceptional circumstances? Ask OceanX to waive the fee</summary>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="requestException" className="h-5 w-5 accent-ocean-700" /> Request an exception
            </label>
            <textarea name="exceptionRequest" rows={3} maxLength={1000} className="input mt-2" placeholder="Explain what happened (e.g. item damaged, lost, stolen)" />
          </details>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" required className="mt-0.5 h-5 w-5 accent-red-600" />
          <span>
            I understand {q.fine > 0 ? `a cancellation fee of ${formatMVR(q.fine)} will apply` : "this listing will be removed"} and want to continue.
          </span>
        </label>
        <SubmitButton className="btn-danger w-full">Yes, remove listing</SubmitButton>
        <Link href="/account/listings" className="btn-ghost w-full">Keep my listing</Link>
      </ActionForm>
    </div>
  );
}
