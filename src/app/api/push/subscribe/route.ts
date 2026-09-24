import { NextResponse } from "next/server";
import { getSession, clientIpHash } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { saveSubscription, removeSubscription } from "@/lib/services/push";
import { UserError } from "@/lib/errors";

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

/** Save this browser's push subscription (linked to the account when logged in). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await enforceRateLimit(`push-sub:${(await clientIpHash()) ?? "unknown"}`, 30, 3600);
    const body = await req.json().catch(() => null);
    const session = await getSession();
    await saveSubscription(body?.subscription, session?.userId ?? null, req.headers.get("user-agent"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof UserError ? e.message : "Could not save";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** Forget this browser (user turned notifications off). */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (typeof body?.endpoint === "string") await removeSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
