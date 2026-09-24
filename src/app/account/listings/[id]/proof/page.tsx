import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { MAX_SALE_PROOFS } from "@/lib/services/deals";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { ProofFields } from "@/components/ProofFields";
import { resubmitProofAction } from "@/app/actions/sell";

export const metadata = { title: "Send new proof of sale" };

export default async function ResendProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireVerifiedUser(`/account/listings/${id}/proof`);
  const l = await prisma.listing.findUnique({ where: { id }, include: { deal: true } });
  if (!l || l.sellerId !== user.id) notFound();
  if (!l.deal || l.deal.proofStatus !== "REJECTED" || l.status !== "PUBLISHED") redirect("/account/listings");
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Send new proof of sale</h1>
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-medium">We couldn&apos;t accept the proof for &ldquo;{l.title}&rdquo;.</p>
        {l.deal.proofReviewNote && <p className="mt-1">{l.deal.proofReviewNote}</p>}
      </div>
      <ActionForm action={resubmitProofAction} className="card space-y-5 p-4">
        <input type="hidden" name="listingId" value={l.id} />
        <ProofFields max={MAX_SALE_PROOFS} />
        <SubmitButton className="btn-primary w-full" pendingText="Sending…">Send new proof</SubmitButton>
        <Link href="/account/listings" className="btn-ghost w-full">Back</Link>
      </ActionForm>
    </div>
  );
}
