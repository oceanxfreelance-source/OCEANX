"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PaymentPurpose } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { runAction, str, bool, type ActionState } from "@/lib/action";
import { createListingDraft, updateListingDraft, submitListing, deleteDraft, updatePublishedListing } from "@/lib/services/listings";
import { submitPayment, cancelOwnPayment } from "@/lib/services/payments";
import { markListingSold, resubmitSaleProof } from "@/lib/services/deals";
import { withdrawListing } from "@/lib/services/cancellations";
import { UserError } from "@/lib/errors";
import { prisma } from "@/lib/db";

async function requireSession(next: string) {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  return s;
}

function listingFields(fd: FormData) {
  return {
    title: str(fd, "title"),
    description: str(fd, "description"),
    price: str(fd, "price"),
    negotiable: bool(fd, "negotiable"),
    condition: str(fd, "condition") as "NEW",
    categoryId: str(fd, "categoryId"),
    subcategoryId: str(fd, "subcategoryId") || null,
    atollId: str(fd, "atollId"),
    islandId: str(fd, "islandId"),
    locationId: str(fd, "locationId") || null,
    locationDetail: str(fd, "locationDetail") || null,
    contactPhone: str(fd, "contactPhone"),
    contactWhatsapp: str(fd, "contactWhatsapp"),
    contactEmail: str(fd, "contactEmail"),
    showPhone: bool(fd, "showPhone"),
    businessId: str(fd, "businessId") || null,
    imageIds: fd.getAll("imageIds").filter((v): v is string => typeof v === "string"),
  };
}

export async function saveListingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireSession("/sell");
  const id = str(fd, "listingId");
  let target = "";
  const res = await runAction(async () => {
    const l = id ? await updateListingDraft(id, s.userId, listingFields(fd)) : await createListingDraft(s.userId, listingFields(fd));
    target = `/sell/${l.id}/preview`;
  });
  if (res?.error) return res;
  redirect(target);
}

export async function submitListingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "listingId");
  const s = await requireSession(`/sell/${id}/preview`);
  let target = "";
  const res = await runAction(async () => {
    const r = await submitListing(id, s.userId);
    target = r.published ? `/listing/${id}` : `/sell/${id}/pay`;
  });
  if (res?.error) return res;
  redirect(target);
}

export async function deleteDraftAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireSession("/account/listings");
  const res = await runAction(async () => {
    await deleteDraft(str(fd, "listingId"), s.userId);
  });
  if (res?.error) return res;
  redirect("/account/listings");
}

/** One action for all payment slips: listing fees, cancellation fines and business subscriptions. */
export async function submitSlipAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireSession("/account");
  const purpose = str(fd, "purpose") as PaymentPurpose;
  const targetId = str(fd, "targetId");
  const file = fd.get("slip");
  let dest = "/account/payments";
  const res = await runAction(async () => {
    if (!(file instanceof File) || file.size === 0) throw new UserError("Please attach your payment slip.");
    if (!["LISTING_FEE", "CANCELLATION_FINE", "BUSINESS_SUBSCRIPTION"].includes(purpose)) throw new UserError("Invalid payment.");
    const target =
      purpose === "LISTING_FEE" ? { purpose, listingId: targetId } : purpose === "CANCELLATION_FINE" ? { purpose, cancellationFineId: targetId } : { purpose, subscriptionId: targetId };
    const r = await submitPayment(
      s.userId,
      target,
      { referenceNumber: str(fd, "referenceNumber"), paidAt: str(fd, "paidAt"), amountPaid: str(fd, "amountPaid"), payerName: str(fd, "payerName"), payerAccount: str(fd, "payerAccount"), bankName: str(fd, "bankName"), note: str(fd, "note") },
      { buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type },
    );
    dest = r.status === "VERIFIED" && purpose === "LISTING_FEE" ? `/listing/${targetId}` : `/account/payments?submitted=${r.paymentId}`;
  });
  if (res?.error) return res;
  redirect(dest);
}

export async function cancelPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireSession("/account/payments");
  return runAction(async () => {
    await cancelOwnPayment(str(fd, "paymentId"), s.userId);
    revalidatePath("/account/payments");
    return { message: "Payment cancelled. You can upload a new slip." };
  });
}

export async function markSoldAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "listingId");
  const s = await requireSession(`/account/listings/${id}/sold`);
  const res = await runAction(async () => {
    await markListingSold(id, s.userId, str(fd, "buyerId") || null, { files: await proofFiles(fd), note: str(fd, "proofNote") });
  });
  if (res?.error) return res;
  redirect("/account/listings?sold=1");
}

async function proofFiles(fd: FormData) {
  const files = fd.getAll("proof").filter((f): f is File => f instanceof File && f.size > 0);
  return Promise.all(files.map(async (f) => ({ buffer: Buffer.from(await f.arrayBuffer()), mimeType: f.type })));
}

export async function resubmitProofAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "listingId");
  const s = await requireSession(`/account/listings/${id}/proof`);
  const res = await runAction(async () => {
    const deal = await prisma.successfulDeal.findUnique({ where: { listingId: id }, select: { id: true } });
    if (!deal) throw new UserError("This listing has no recorded sale.");
    await resubmitSaleProof(deal.id, s.userId, { files: await proofFiles(fd), note: str(fd, "proofNote") });
  });
  if (res?.error) return res;
  redirect("/account/listings?tab=sold&proof=1");
}

export async function withdrawAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "listingId");
  const s = await requireSession(`/account/listings/${id}/withdraw`);
  const res = await runAction(async () => {
    await withdrawListing(id, s.userId, {
      confirmed: bool(fd, "confirm"),
      expectedFine: Number(str(fd, "expectedFine")),
      reason: str(fd, "reason"),
      exceptionRequest: bool(fd, "requestException") ? str(fd, "exceptionRequest") : "",
    });
  });
  if (res?.error) return res;
  redirect("/account/cancellations?withdrawn=1");
}

export async function editPublishedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "listingId");
  const s = await requireSession(`/account/listings/${id}/edit`);
  const res = await runAction(async () => {
    await updatePublishedListing(id, s.userId, {
      description: str(fd, "description"),
      price: str(fd, "price"),
      negotiable: bool(fd, "negotiable"),
      locationDetail: str(fd, "locationDetail") || null,
      contactPhone: str(fd, "contactPhone"),
      contactWhatsapp: str(fd, "contactWhatsapp"),
      contactEmail: str(fd, "contactEmail"),
      showPhone: bool(fd, "showPhone"),
    });
  });
  if (res?.error) return res;
  redirect(`/listing/${id}`);
}
