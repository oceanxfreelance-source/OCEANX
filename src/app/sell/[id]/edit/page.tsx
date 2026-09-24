import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { ListingForm } from "@/components/ListingForm";
import { saveListingAction } from "@/app/actions/sell";
import { EDITABLE_STATUSES } from "@/lib/services/listings";
import { fileUrl } from "@/lib/storage";
import { sellFormData } from "../../data";

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireVerifiedUser(`/sell/${id}/edit`);
  const l = await prisma.listing.findUnique({ where: { id }, include: { images: { orderBy: { sortOrder: "asc" } } } });
  if (!l || l.sellerId !== user.id) notFound();
  if (!EDITABLE_STATUSES.includes(l.status)) redirect(l.status === "PUBLISHED" ? `/account/listings/${id}/edit` : "/account/listings");
  const formData = await sellFormData(user.id);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Edit listing</h1>
      <ListingForm
        action={saveListingAction}
        categories={formData.categories} atolls={formData.atolls} businesses={formData.businesses} conditions={formData.conditions} maxImages={formData.maxImages}
        defaults={{ ...l, id: l.id, price: String(l.price / 100), images: l.images.map((i) => ({ id: i.fileId, url: fileUrl(i.fileId)! })) }}
      />
    </div>
  );
}
