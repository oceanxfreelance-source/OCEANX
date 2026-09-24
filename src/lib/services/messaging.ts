import { prisma } from "../db";
import { UserError, NotFoundError, ForbiddenError } from "../errors";
import { enforceRateLimit } from "../rate-limit";
import { cleanText } from "../validation";
import { notify } from "../notify";

export async function startConversation(buyerId: string, listingId: string, firstMessage: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || !["PUBLISHED", "SOLD"].includes(listing.status)) throw new NotFoundError("Listing not found.");
  if (listing.sellerId === buyerId) throw new UserError("This is your own listing.");
  const buyer = await prisma.user.findUniqueOrThrow({ where: { id: buyerId } });
  if (!buyer.emailVerifiedAt) throw new UserError("Please verify your email before messaging sellers.", "EMAIL_UNVERIFIED");
  const conv = await prisma.conversation.upsert({
    where: { listingId_buyerId: { listingId, buyerId } },
    create: { listingId, buyerId, sellerId: listing.sellerId },
    update: {},
  });
  if (firstMessage.trim()) await sendMessage(conv.id, buyerId, firstMessage);
  return conv;
}

export async function sendMessage(conversationId: string, senderId: string, bodyRaw: string) {
  const body = cleanText(bodyRaw, 2000);
  if (!body) throw new UserError("Message cannot be empty.");
  await enforceRateLimit(`msg:${senderId}`, 40, 300, "You're sending messages too quickly. Please slow down.");
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { listing: { select: { title: true } } } });
  if (!conv) throw new NotFoundError();
  if (conv.buyerId !== senderId && conv.sellerId !== senderId) throw new ForbiddenError();
  const sender = await prisma.user.findUniqueOrThrow({ where: { id: senderId } });
  if (sender.status !== "ACTIVE") throw new ForbiddenError("Your account is not active.");
  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({ data: { conversationId, senderId, body } });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: m.createdAt } });
    return m;
  });
  const recipient = conv.buyerId === senderId ? conv.sellerId : conv.buyerId;
  // Collapse notifications: only notify if the recipient has no unread message notification for this chat.
  const existing = await prisma.notification.findFirst({ where: { userId: recipient, type: "message", link: `/messages/${conversationId}`, readAt: null } });
  if (!existing) {
    await notify(recipient, {
      type: "message",
      title: `New message from ${sender.name}`,
      body: conv.listing ? `About "${conv.listing.title}": ${body.slice(0, 120)}` : body.slice(0, 120),
      link: `/messages/${conversationId}`,
      event: "newMessage",
    });
  }
  return msg;
}

export async function getConversationForUser(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      listing: { select: { id: true, title: true, price: true, status: true, images: { take: 1, orderBy: { sortOrder: "asc" }, select: { fileId: true } } } },
      buyer: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true, phone: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 500 },
    },
  });
  if (!conv) throw new NotFoundError();
  if (conv.buyerId !== userId && conv.sellerId !== userId) throw new ForbiddenError();
  await prisma.message.updateMany({ where: { conversationId, senderId: { not: userId }, readAt: null }, data: { readAt: new Date() } });
  await prisma.notification.updateMany({ where: { userId, link: `/messages/${conversationId}`, readAt: null }, data: { readAt: new Date() } });
  return conv;
}

export async function listConversations(userId: string) {
  const convs = await prisma.conversation.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }], messages: { some: {} } },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      listing: { select: { id: true, title: true, images: { take: 1, orderBy: { sortOrder: "asc" }, select: { fileId: true } } } },
      buyer: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: { where: { readAt: null, senderId: { not: userId } } } } },
    },
  });
  return convs;
}

export async function unreadMessageCount(userId: string) {
  return prisma.message.count({ where: { readAt: null, senderId: { not: userId }, conversation: { OR: [{ buyerId: userId }, { sellerId: userId }] } } });
}
