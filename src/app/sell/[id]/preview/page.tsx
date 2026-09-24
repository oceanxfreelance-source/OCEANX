import { Pencil } from "lucide-react";
import Link from "next/link";
import { placeLabel } from "@/lib/place";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { quotePostingFee } from "@/lib/services/fees";
import { CONDITIONS } from "@/lib/services/listings";
import { getSiteSettings } from "@/lib/site";
import { fileUrl } from "@/lib/storage";
import { formatMVR } from "@/lib/money";
import { Gallery } from "@/components/Gallery";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { submitListingAction, deleteDraftAction } from "@/app/actions/sell";

export const metadata = { title: "Preview listing" };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireVerifiedUser(`/sell/${id}/preview`);
  const l = await prisma.listing.findUnique({ where: { id }, include: { images: { orderBy: { sortOrder: "asc" } }, category: true, subcategory: true, island: true, atoll: true, location: true, business: true } });
  if (!l || l.sellerId !== user.id) notFound();
  if (l.status === "PAYMENT_REVIEW") redirect("/account/payments");
  if (["PUBLISHED", "SOLD"].includes(l.status)) redirect(`/listing/${id}`);
  const [quote, settings] = await Promise.all([quotePostingFee(user.id, { businessId: l.businessId, excludeListingId: l.id }), getSiteSettings()]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Preview</h1>
        <Link href={`/sell/${id}/edit`} className="btn-secondary btn-sm"><Pencil className="h-3.5 w-3.5" /> Edit</Link>
      </div>
      <p className="text-sm text-slate-600">This is how buyers will see your listing.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Gallery images={l.images.map((i) => fileUrl(i.fileId)!)} title={l.title} />
        <div className="card space-y-2 p-4">
          <p className="text-xs text-slate-500">{l.category.name}{l.subcategory ? ` › ${l.subcategory.name}` : ""}</p>
          <h2 className="text-xl font-semibold">{l.title}</h2>
          <p className="text-2xl font-semibold tracking-tight text-ocean-800">{formatMVR(l.price, { free: "Free" })} {l.negotiable && <span className="text-sm font-medium text-slate-500">· Negotiable</span>}</p>
          <p className="text-sm">Condition: {CONDITIONS.find((c) => c.value === l.condition)?.label}</p>
          <p className="text-sm">Location: {placeLabel(l)}</p>
          {l.contactPhone && <p className="text-sm">Phone: {l.contactPhone} {l.showPhone ? "" : "(hidden)"}</p>}
          {l.business && <p className="text-sm">Posted as {l.business.name}</p>}
          <p className="whitespace-pre-line pt-2 text-sm text-slate-700">{l.description}</p>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        {quote.amount === 0 ? (
          <p className="font-medium text-emerald-700">This listing will be published immediately{quote.waivedReason === "business_plan" ? " — included in your business plan" : ""}.</p>
        ) : (
          <div>
            <p className="font-semibold text-slate-900">Ready to publish?</p>
            <p className="text-sm text-slate-500">Next, you&apos;ll complete a quick payment. Your listing goes live as soon as it&apos;s verified.</p>
          </div>
        )}
        {settings.cancellation.enabled && settings.cancellation.fineAmount > 0 && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            Once published, please keep your item available until it sells. Voluntarily withdrawing a published listing may incur a cancellation fee of {formatMVR(settings.cancellation.fineAmount)}. Marking it as SOLD is always free.
          </p>
        )}
        <ActionForm action={submitListingAction}>
          <input type="hidden" name="listingId" value={l.id} />
          <SubmitButton className="btn-accent w-full">{quote.amount === 0 ? "Publish now" : "Continue"}</SubmitButton>
        </ActionForm>
        <ActionForm action={deleteDraftAction}>
          <input type="hidden" name="listingId" value={l.id} />
          <SubmitButton className="btn-ghost w-full text-red-600" confirm="Delete this draft? This cannot be undone.">Delete draft</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
