import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { editPublishedAction } from "@/app/actions/sell";

export const metadata = { title: "Edit listing" };

export default async function EditPublishedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireVerifiedUser(`/account/listings/${id}/edit`);
  const l = await prisma.listing.findUnique({ where: { id } });
  if (!l || l.sellerId !== user.id) notFound();
  if (!["PUBLISHED", "PAYMENT_REVIEW"].includes(l.status)) redirect("/account/listings");
  return (
    <div className="mx-auto max-w-lg space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Edit “{l.title}”</h1>
      <p className="text-sm text-slate-600">You can update the price, description and contact details. The title, category and photos of a published listing can&apos;t be changed.</p>
      <ActionForm action={editPublishedAction} className="card p-4">
        <input type="hidden" name="listingId" value={l.id} />
        <Field label="Price (MVR)" name="price">
          <input id="price" name="price" required inputMode="decimal" defaultValue={l.price / 100} className="input" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="negotiable" defaultChecked={l.negotiable} className="h-5 w-5 accent-ocean-700" /> Negotiable
        </label>
        <Field label="Description" name="description">
          <textarea id="description" name="description" rows={6} required minLength={10} maxLength={5000} defaultValue={l.description} className="input" />
        </Field>
        <Field label="Location details" name="locationDetail">
          <input id="locationDetail" name="locationDetail" maxLength={120} defaultValue={l.locationDetail ?? ""} className="input" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Phone" name="contactPhone"><input id="contactPhone" name="contactPhone" type="tel" defaultValue={l.contactPhone?.replace("+960", "") ?? ""} className="input" /></Field>
          <Field label="WhatsApp" name="contactWhatsapp"><input id="contactWhatsapp" name="contactWhatsapp" type="tel" defaultValue={l.contactWhatsapp?.replace("+960", "") ?? ""} className="input" /></Field>
          <Field label="Email" name="contactEmail"><input id="contactEmail" name="contactEmail" type="email" defaultValue={l.contactEmail ?? ""} className="input" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showPhone" defaultChecked={l.showPhone} className="h-5 w-5 accent-ocean-700" /> Show phone number
        </label>
        <SubmitButton className="btn-primary w-full">Save changes</SubmitButton>
      </ActionForm>
    </div>
  );
}
