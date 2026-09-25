import { prisma } from "../db";
import { UserError, NotFoundError, ForbiddenError } from "../errors";
import { notify } from "../notify";
import { audit } from "../audit";
import { hasPermission } from "../permissions";
import { enforceRateLimit } from "../rate-limit";
import { pushToUsers } from "./push";
import type { BotTurn } from "./support-bot";

/** Live help chat between a customer and the OceanX team ("Talk to a person"). */

const NOTIFY_GAP_MS = 2 * 60_000; // don't notify the other side more than once per 2 minutes per chat

function clean(body: string) {
  const t = body.replace(/\s+\n/g, "\n").trim().slice(0, 2000);
  if (!t) throw new UserError("Type a message first.");
  return t;
}

async function supportAdmins() {
  const admins = await prisma.user.findMany({ where: { adminRoleId: { not: null }, status: "ACTIVE" }, select: { id: true, adminRole: { select: { permissions: true } } } });
  return admins.filter((a) => hasPermission(a.adminRole?.permissions, "support")).map((a) => a.id);
}

async function alertAdmins(threadId: string, title: string, body: string) {
  const ids = await supportAdmins();
  const link = `/admin/support/${threadId}`;
  for (const id of ids) await notify(id, { type: "support", title, body, link });
  await pushToUsers(ids, { title, body, url: link, tag: `support-${threadId}` }).catch(() => undefined);
}

/** The customer's current (not closed) chat, if any. */
export async function currentThread(userId: string) {
  return prisma.supportThread.findFirst({
    where: { userId, status: { not: "CLOSED" } },
    orderBy: { createdAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } },
  });
}

/** "Talk to a person": opens (or reuses) a chat, keeps the recent assistant conversation for context, and alerts the team. */
export async function requestAgent(userId: string, transcript: BotTurn[] = [], firstMessage?: string) {
  await enforceRateLimit(`support-open:${userId}`, 10, 3600, "Please wait a little before opening another chat.");
  const existing = await currentThread(userId);
  if (existing) {
    if (firstMessage?.trim()) await sendAsUser(userId, existing.id, firstMessage);
    return existing.id;
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
  const recent = transcript.filter((t) => t.content?.trim()).slice(-10);
  const firstUser = [...recent].reverse().find((t) => t.role === "user")?.content ?? firstMessage ?? "";
  const thread = await prisma.supportThread.create({
    data: {
      userId,
      subject: (firstMessage || firstUser || "Help request").slice(0, 120),
      messages: {
        create: [
          ...recent.map((t) => ({ sender: (t.role === "user" ? "USER" : "BOT") as "USER" | "BOT", body: t.content.slice(0, 2000) })),
          { sender: "SYSTEM" as const, body: "Customer asked to talk to a person." },
          ...(firstMessage?.trim() ? [{ sender: "USER" as const, body: clean(firstMessage) }] : []),
        ],
      },
      lastAgentNotify: new Date(),
    },
  });
  await alertAdmins(thread.id, "New help chat", `${user.name} wants to talk to a person${firstUser ? `: “${firstUser.slice(0, 120)}”` : "."}`);
  return thread.id;
}

export async function sendAsUser(userId: string, threadId: string, body: string) {
  await enforceRateLimit(`support-msg:${userId}`, 40, 600, "You're sending messages too quickly. Please wait a moment.");
  const t = await prisma.supportThread.findUnique({ where: { id: threadId } });
  if (!t) throw new NotFoundError();
  if (t.userId !== userId) throw new ForbiddenError();
  if (t.status === "CLOSED") throw new UserError("This chat was closed. Start a new one if you still need help.");
  const now = new Date();
  const text = clean(body);
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { threadId, sender: "USER", body: text } }),
    prisma.supportThread.update({ where: { id: threadId }, data: { lastMessageAt: now, userReadAt: now } }),
  ]);
  if (!t.lastAgentNotify || now.getTime() - t.lastAgentNotify.getTime() > NOTIFY_GAP_MS) {
    await prisma.supportThread.update({ where: { id: threadId }, data: { lastAgentNotify: now } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    await alertAdmins(threadId, `Message from ${user.name}`, text.slice(0, 160));
  }
}

export async function sendAsAgent(adminId: string, threadId: string, body: string) {
  const t = await prisma.supportThread.findUnique({ where: { id: threadId } });
  if (!t) throw new NotFoundError();
  const now = new Date();
  const text = clean(body);
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { threadId, sender: "AGENT", agentId: adminId, body: text } }),
    prisma.supportThread.update({ where: { id: threadId }, data: { status: "OPEN", lastMessageAt: now, agentReadAt: now, closedAt: null } }),
  ]);
  if (t.status === "WAITING") await audit({ actorId: adminId, action: "support.answer", entityType: "SupportThread", entityId: threadId, summary: "Answered a help chat" });
  if (!t.lastUserNotify || now.getTime() - t.lastUserNotify.getTime() > NOTIFY_GAP_MS) {
    await prisma.supportThread.update({ where: { id: threadId }, data: { lastUserNotify: now } });
    await notify(t.userId, { type: "support", title: "MV Markets team replied", body: text.slice(0, 160), link: "/?help=1" });
    await pushToUsers([t.userId], { title: "MV Markets team replied", body: text.slice(0, 160), url: "/?help=1", tag: `support-${threadId}` }).catch(() => undefined);
  }
}

export async function closeThread(threadId: string, by: { adminId?: string; userId?: string }) {
  const t = await prisma.supportThread.findUnique({ where: { id: threadId } });
  if (!t) throw new NotFoundError();
  if (by.userId && t.userId !== by.userId) throw new ForbiddenError();
  if (t.status === "CLOSED") return;
  const now = new Date();
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { threadId, sender: "SYSTEM", body: by.adminId ? "The team closed this chat." : "Customer ended the chat." } }),
    prisma.supportThread.update({ where: { id: threadId }, data: { status: "CLOSED", closedAt: now, lastMessageAt: now } }),
  ]);
  if (by.adminId) await audit({ actorId: by.adminId, action: "support.close", entityType: "SupportThread", entityId: threadId, summary: "Closed a help chat" });
}

/** Messages after a point in time, for live polling. Marks them read for the side that asked. */
export async function threadForUser(userId: string) {
  const t = await currentThread(userId);
  if (t) await prisma.supportThread.update({ where: { id: t.id }, data: { userReadAt: new Date() } });
  return t;
}

export async function threadForAgent(threadId: string) {
  const t = await prisma.supportThread.findUnique({
    where: { id: threadId },
    include: { user: { select: { id: true, name: true, email: true, phone: true } }, messages: { orderBy: { createdAt: "asc" }, take: 500 } },
  });
  if (!t) throw new NotFoundError();
  await prisma.supportThread.update({ where: { id: threadId }, data: { agentReadAt: new Date() } });
  return t;
}

/** Chats needing attention: waiting for a first answer, or with a new customer message. */
export async function unansweredCount() {
  const rows = await prisma.supportThread.findMany({ where: { status: { not: "CLOSED" } }, select: { status: true, lastMessageAt: true, agentReadAt: true } });
  return rows.filter((r) => r.status === "WAITING" || !r.agentReadAt || r.lastMessageAt > r.agentReadAt).length;
}
