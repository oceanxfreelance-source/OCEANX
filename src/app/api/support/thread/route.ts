import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { closeThread, requestAgent, sendAsUser, threadForUser } from "@/lib/services/support";
import { UserError } from "@/lib/errors";

const view = (t: Awaited<ReturnType<typeof threadForUser>>) =>
  t && {
    id: t.id,
    status: t.status,
    messages: t.messages.map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt })),
  };

/** The customer's live chat with the team (for the help widget). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ loggedIn: false, thread: null }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ loggedIn: true, thread: view(await threadForUser(session.userId)) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in to chat with our team.", loggedIn: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "request") await requestAgent(session.userId, Array.isArray(body.transcript) ? body.transcript : [], typeof body.message === "string" ? body.message : undefined);
    else if (body.action === "send") await sendAsUser(session.userId, String(body.threadId ?? ""), String(body.body ?? ""));
    else if (body.action === "close") await closeThread(String(body.threadId ?? ""), { userId: session.userId });
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof UserError ? e.message : "Something went wrong. Please try again." }, { status: 400 });
  }
  return NextResponse.json({ loggedIn: true, thread: view(await threadForUser(session.userId)) });
}
