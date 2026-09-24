"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { runAction, str, type ActionState } from "@/lib/action";
import { startConversation, sendMessage } from "@/lib/services/messaging";
import { createReport } from "@/lib/services/reports";
import { joinGiveaway } from "@/lib/services/giveaways";
import { confirmDeal, disputeDeal } from "@/lib/services/deals";
import { UserError } from "@/lib/errors";

async function sessionOrLogin(next: string) {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  return s;
}

export async function toggleSaveAction(listingId: string): Promise<void> {
  const s = await sessionOrLogin(`/listing/${listingId}`);
  const existing = await prisma.savedListing.findUnique({ where: { userId_listingId: { userId: s.userId, listingId } } });
  if (existing) await prisma.savedListing.delete({ where: { userId_listingId: { userId: s.userId, listingId } } });
  else {
    const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { status: true } });
    if (listing && ["PUBLISHED", "SOLD"].includes(listing.status)) await prisma.savedListing.create({ data: { userId: s.userId, listingId } });
  }
  revalidatePath(`/listing/${listingId}`);
  revalidatePath("/account/saved");
}

export async function contactSellerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const listingId = str(fd, "listingId");
  const s = await sessionOrLogin(`/listing/${listingId}`);
  let convId = "";
  const res = await runAction(async () => {
    const conv = await startConversation(s.userId, listingId, str(fd, "message"));
    convId = conv.id;
  });
  if (res?.error) return res;
  redirect(`/messages/${convId}`);
}

export async function sendMessageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const conversationId = str(fd, "conversationId");
  const s = await sessionOrLogin(`/messages/${conversationId}`);
  return runAction(async () => {
    await sendMessage(conversationId, s.userId, str(fd, "body"));
    revalidatePath(`/messages/${conversationId}`);
  });
}

export async function reportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const listingId = str(fd, "listingId") || undefined;
  const s = await sessionOrLogin(listingId ? `/listing/${listingId}` : "/");
  return runAction(async () => {
    await createReport(s.userId, { listingId, targetUserId: str(fd, "userId") || undefined, reason: str(fd, "reason"), details: str(fd, "details") });
    return { message: "Thanks — our team will review this report." };
  });
}

export async function joinGiveawayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await sessionOrLogin("/giveaways");
  return runAction(async () => {
    await joinGiveaway(str(fd, "giveawayId"), s.userId);
    revalidatePath("/giveaways");
    return { message: "You're in! Good luck 🍀" };
  });
}

export async function answerDealAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await sessionOrLogin("/account/purchases");
  return runAction(async () => {
    const dealId = str(fd, "dealId");
    const answer = str(fd, "answer");
    if (answer === "confirm") await confirmDeal(dealId, s.userId);
    else if (answer === "dispute") await disputeDeal(dealId, s.userId, str(fd, "reason"));
    else throw new UserError("Invalid answer.");
    revalidatePath("/account/purchases");
    return { message: answer === "confirm" ? "Thanks for confirming!" : "Thanks — we've recorded that this purchase did not happen." };
  });
}

export async function markNotificationsReadAction(): Promise<void> {
  const s = await sessionOrLogin("/account/notifications");
  await prisma.notification.updateMany({ where: { userId: s.userId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/account/notifications");
}
