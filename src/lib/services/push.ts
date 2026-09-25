import webpush from "web-push";
import { prisma } from "../db";
import { env } from "../env";
import { getSettings } from "../settings";
import { formatMVR } from "../money";
import { fileUrl } from "../storage";
import { placeLabel } from "../place";
import { UserError } from "../errors";
import { audit } from "../audit";

/**
 * Push notifications to phones and browsers (Web Push / VAPID) plus a broadcast feed the Android app reads.
 * VAPID keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY if set; otherwise they are generated once and
 * kept in the database, so push works without any extra setup.
 */

const VAPID_KEY = "_vapid";
let cached: { publicKey: string; privateKey: string } | null = null;

export async function getVapidKeys() {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return cached;
  }
  const row = await prisma.siteSetting.findUnique({ where: { key: VAPID_KEY } });
  if (row) {
    cached = row.value as { publicKey: string; privateKey: string };
    return cached;
  }
  const keys = webpush.generateVAPIDKeys();
  // If two requests race, the first write wins and both read it back.
  await prisma.siteSetting.upsert({ where: { key: VAPID_KEY }, create: { key: VAPID_KEY, value: { publicKey: keys.publicKey, privateKey: keys.privateKey } }, update: {} });
  const saved = await prisma.siteSetting.findUniqueOrThrow({ where: { key: VAPID_KEY } });
  cached = saved.value as { publicKey: string; privateKey: string };
  return cached;
}

export type SubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

function validSubscription(sub: unknown): sub is SubscriptionInput {
  const s = sub as SubscriptionInput;
  return (
    !!s &&
    typeof s.endpoint === "string" &&
    /^https:\/\//.test(s.endpoint) &&
    s.endpoint.length < 1000 &&
    typeof s.keys?.p256dh === "string" &&
    typeof s.keys?.auth === "string" &&
    s.keys.p256dh.length < 200 &&
    s.keys.auth.length < 100
  );
}

export async function saveSubscription(sub: unknown, userId: string | null, userAgent: string | null) {
  if (!validSubscription(sub)) throw new UserError("Invalid subscription.");
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userId, userAgent: userAgent?.slice(0, 300) ?? null },
    update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, userId, failures: 0, userAgent: userAgent?.slice(0, 300) ?? null },
  });
}

export async function removeSubscription(endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

type Payload = { title: string; body: string; url: string; image?: string | null; tag: string };

/** Test hook: replaces the real network send. */
let sender: ((sub: { endpoint: string; p256dh: string; auth: string }, payload: string) => Promise<void>) | null = null;
export function setPushSenderForTests(fn: typeof sender) {
  sender = fn;
}

async function deliver(payload: Payload, excludeUserId: string | null, onlyUserIds?: string[]) {
  const { publicKey, privateKey } = await getVapidKeys();
  const subject = process.env.VAPID_SUBJECT || `mailto:${(await getSettings()).general.supportEmail || "support@mvmarkets.mv"}`;
  const subs = await prisma.pushSubscription.findMany({
    where: onlyUserIds ? { userId: { in: onlyUserIds } } : excludeUserId ? { OR: [{ userId: null }, { userId: { not: excludeUserId } }] } : {},
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  const failedIds: string[] = [];
  const BATCH = 25;
  for (let i = 0; i < subs.length; i += BATCH) {
    await Promise.all(
      subs.slice(i, i + BATCH).map(async (s) => {
        try {
          if (sender) await sender(s, body);
          else
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
              vapidDetails: { subject, publicKey, privateKey },
              TTL: 60 * 60 * 24,
              urgency: "normal",
              topic: payload.tag.slice(0, 32),
            });
          sent++;
        } catch (e) {
          failed++;
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) gone.push(s.id);
          else failedIds.push(s.id);
        }
      }),
    );
  }
  if (gone.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  if (failedIds.length) {
    await prisma.pushSubscription.updateMany({ where: { id: { in: failedIds } }, data: { failures: { increment: 1 } } });
    await prisma.pushSubscription.deleteMany({ where: { failures: { gte: 5 } } });
  }
  return { sent, failed };
}

/** Push to specific people's phones/browsers (e.g. a support reply). Not recorded as a broadcast. */
export async function pushToUsers(userIds: string[], payload: { title: string; body: string; url: string; tag?: string }) {
  if (!userIds.length) return { sent: 0, failed: 0 };
  return deliver({ ...payload, tag: payload.tag ?? "personal" }, null, userIds);
}

/** Records the broadcast (for the Android app feed) and pushes it to every subscribed phone/browser. */
async function broadcast(input: { kind: "NEW_LISTING" | "ANNOUNCEMENT"; title: string; body: string; url: string; image?: string | null; listingId?: string; excludeUserId?: string | null; createdById?: string | null }) {
  const b = await prisma.broadcast.create({
    data: { kind: input.kind, title: input.title, body: input.body, url: input.url, imageUrl: input.image ?? null, listingId: input.listingId ?? null, excludeUserId: input.excludeUserId ?? null, createdById: input.createdById ?? null },
  });
  const r = await deliver({ title: input.title, body: input.body, url: input.url, image: input.image, tag: input.kind === "NEW_LISTING" ? "new-listing" : `announce-${b.id}` }, input.excludeUserId ?? null);
  await prisma.broadcast.update({ where: { id: b.id }, data: { sentCount: r.sent, failedCount: r.failed } });
  return { ...r, id: b.id };
}

/** "New item" notification to everyone (except the seller) when a listing goes live. */
export async function announceNewListing(listingId: string) {
  const settings = await getSettings();
  if (!settings.notifications.pushNewListings) return null;
  const l = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true, title: true, price: true, sellerId: true, status: true, locationDetail: true,
      images: { take: 1, orderBy: { sortOrder: "asc" }, select: { fileId: true } },
      island: { select: { name: true } }, atoll: { select: { code: true, name: true } }, location: { select: { name: true } },
    },
  });
  if (!l || l.status !== "PUBLISHED") return null;
  const already = await prisma.broadcast.findFirst({ where: { kind: "NEW_LISTING", listingId }, select: { id: true } });
  if (already) return null;
  const img = fileUrl(l.images[0]?.fileId);
  return broadcast({
    kind: "NEW_LISTING",
    title: `New: ${l.title}`.slice(0, 100),
    body: `${formatMVR(l.price, { free: "Free" })} · ${placeLabel(l, { short: true })}`,
    url: `/listing/${l.id}`,
    image: img ? `${env.appUrl}${img}` : null,
    listingId: l.id,
    excludeUserId: l.sellerId,
  });
}

/** Admin announcement, e.g. "App updated". */
export async function sendAnnouncement(adminId: string, input: { title: string; body: string; url?: string }) {
  const title = input.title.trim().slice(0, 80);
  const body = input.body.trim().slice(0, 240);
  const url = (input.url ?? "").trim() || "/";
  if (!title || !body) throw new UserError("Enter a title and a message.");
  if (!url.startsWith("/") || url.startsWith("//")) throw new UserError("The link must be a page on this site, e.g. / or /giveaways");
  const r = await broadcast({ kind: "ANNOUNCEMENT", title, body, url, createdById: adminId });
  await audit({ actorId: adminId, action: "push.announce", entityType: "Broadcast", entityId: r.id, summary: `"${title}" sent to ${r.sent} device(s)` });
  return r;
}

/**
 * Feed for the Android app's background check: the newest broadcasts after `since` meant for this user,
 * plus how many new items there were in total (the app summarises when there are many).
 */
export async function broadcastFeed(since: Date, userId: string | null) {
  const where = { createdAt: { gt: since }, ...(userId ? { OR: [{ excludeUserId: null }, { excludeUserId: { not: userId } }] } : {}) };
  const [items, newItems] = await Promise.all([
    prisma.broadcast.findMany({ where, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, kind: true, title: true, body: true, url: true, createdAt: true } }),
    prisma.broadcast.count({ where: { ...where, kind: "NEW_LISTING" } }),
  ]);
  return { items: items.reverse(), newItems };
}
