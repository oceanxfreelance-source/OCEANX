import { NextResponse } from "next/server";
import { clientIpHash } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { botReply, type BotTurn } from "@/lib/services/support-bot";
import { UserError } from "@/lib/errors";

/** Help assistant: answers basic questions. Works for everyone (no login needed). */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await enforceRateLimit(`support-bot:${(await clientIpHash()) ?? "unknown"}`, 40, 3600, "You've asked a lot of questions — please wait a bit, or tap “Talk to a person”.");
  } catch (e) {
    return NextResponse.json({ error: e instanceof UserError ? e.message : "Try again later" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const messages: BotTurn[] = Array.isArray(body?.messages) ? body.messages : [];
  const reply = await botReply(messages);
  return NextResponse.json(reply, { headers: { "Cache-Control": "no-store" } });
}
