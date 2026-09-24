"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { runAction, str, type ActionState } from "@/lib/action";
import { createBusiness, updateBusiness, requestSubscription, featureListing } from "@/lib/services/business";
import { UserError } from "@/lib/errors";

async function requireSession() {
  const s = await getSession();
  if (!s) redirect("/login?next=/account/business");
  return s;
}

function fields(fd: FormData) {
  return {
    name: str(fd, "name"),
    description: str(fd, "description"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    website: str(fd, "website"),
    address: str(fd, "address"),
    islandId: str(fd, "islandId") || null,
    brandColor: str(fd, "brandColor"),
  };
}

async function ownedFile(userId: string, id: string, purpose: string) {
  if (!id) return null;
  const f = await prisma.storedFile.findFirst({ where: { id, ownerId: userId, purpose } });
  if (!f) throw new UserError("Image not found. Please upload again.");
  return f.id;
}

export async function createBusinessAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireSession();
  let id = "";
  const res = await runAction(async () => {
    id = (await createBusiness(s.userId, fields(fd))).id;
  });
  if (res?.error) return res;
  redirect(`/account/business/${id}`);
}

export async function updateBusinessAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireSession();
  return runAction(async () => {
    const id = str(fd, "businessId");
    const logo = fd.getAll("logoFileId").filter((v): v is string => typeof v === "string")[0] ?? "";
    const banner = fd.getAll("bannerFileId").filter((v): v is string => typeof v === "string")[0] ?? "";
    await updateBusiness(id, s.userId, fields(fd), {
      logoFileId: await ownedFile(s.userId, logo, "business_logo"),
      bannerFileId: await ownedFile(s.userId, banner, "business_banner"),
    });
    revalidatePath(`/account/business/${id}`);
    return { message: "Business details saved." };
  });
}

export async function subscribeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireSession();
  const id = str(fd, "businessId");
  const res = await runAction(async () => {
    await requestSubscription(id, s.userId, str(fd, "planId"));
  });
  if (res?.error) return res;
  redirect(`/account/business/${id}#pay`);
}

export async function featureListingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireSession();
  return runAction(async () => {
    await featureListing(str(fd, "businessId"), s.userId, str(fd, "listingId"), 7);
    revalidatePath(`/account/business/${str(fd, "businessId")}`);
    return { message: "Listing featured for 7 days." };
  });
}
