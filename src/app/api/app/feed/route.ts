import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { broadcastFeed } from "@/lib/services/push";
import { prisma } from "@/lib/db";

/**
 * Background feed for the Android app: new-item and announcement notifications since `since` (ISO time).
 * The app checks it periodically and shows them as phone notifications.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("since");
  const now = new Date();
  let since = raw ? new Date(raw) : now;
  if (Number.isNaN(since.getTime())) since = now;
  // Never look back more than 2 days (e.g. a phone that was off for a week).
  const floor = new Date(now.getTime() - 2 * 86400_000);
  if (since < floor) since = floor;
  const session = await getSession();
  const feed = since >= now ? { items: [], newItems: 0 } : await broadcastFeed(since, session?.userId ?? null);
  // Personal notifications (support replies, payments, sales…) for the logged-in app user.
  const personal =
    session && since < now
      ? await prisma.notification.findMany({ where: { userId: session.userId, createdAt: { gt: since } }, orderBy: { createdAt: "desc" }, take: 10 })
      : [];
  const items = [
    ...feed.items,
    ...personal.reverse().map((n) => ({ id: `n-${n.id}`, kind: "PERSONAL", title: n.title, body: n.body, url: n.link && n.link.startsWith("/") ? n.link : "/account/notifications", createdAt: n.createdAt })),
  ];
  return NextResponse.json({ now: now.toISOString(), items, newItems: feed.newItems }, { headers: { "Cache-Control": "no-store" } });
}
