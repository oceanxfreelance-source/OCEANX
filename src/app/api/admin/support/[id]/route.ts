import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions";
import { closeThread, sendAsAgent, threadForAgent } from "@/lib/services/support";
import { UserError } from "@/lib/errors";

async function guard() {
  const admin = await getAdmin();
  return admin && hasPermission(admin.permissions, "support") ? admin : null;
}

const view = (t: Awaited<ReturnType<typeof threadForAgent>>) => ({
  id: t.id,
  status: t.status,
  messages: t.messages.map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt })),
});

/** Live view of one help chat for the admin (polled every few seconds). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await guard();
  if (!admin) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  try {
    return NextResponse.json(view(await threadForAgent(id)), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = await guard();
  if (!admin) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "close") await closeThread(id, { adminId: admin.user.id });
    else await sendAsAgent(admin.user.id, id, String(body.body ?? ""));
    return NextResponse.json(view(await threadForAgent(id)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof UserError ? e.message : "Something went wrong." }, { status: 400 });
  }
}
