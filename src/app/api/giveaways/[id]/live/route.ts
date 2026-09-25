import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { giveawayLiveState } from "@/lib/services/giveaways";

/** Live state for the giveaway draw machine (names on the reel, countdown, winners). Draws automatically at the end time. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const session = await getSession();
  const state = await giveawayLiveState(id, session?.userId ?? null);
  if (!state) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
