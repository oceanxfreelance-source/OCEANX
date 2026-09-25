import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/dates";
import { PageTitle } from "@/components/admin/ui";

export const metadata = { title: "Support chats" };
export const dynamic = "force-dynamic";

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireAdminPage("support");
  const sp = await searchParams;
  const closed = sp.show === "closed";
  const threads = await prisma.supportThread.findMany({
    where: closed ? { status: "CLOSED" } : { status: { not: "CLOSED" } },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, email: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return (
    <>
      <PageTitle title="Support chats" />
      <p className="text-sm text-slate-600">Customers who tapped “Talk to a person” in the help chat. You get a notification for each new chat and message. Replies reach the customer instantly in the chat, plus a notification.</p>
      <div className="flex gap-2">
        <Link href="/admin/support" className={!closed ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Open</Link>
        <Link href="/admin/support?show=closed" className={closed ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Closed</Link>
      </div>
      <div className="card divide-y divide-slate-100">
        {threads.length === 0 && <p className="p-6 text-center text-sm text-slate-500">{closed ? "No closed chats yet." : "No open chats. 🎉"}</p>}
        {threads.map((t) => {
          const last = t.messages[0];
          const needs = t.status === "WAITING" || !t.agentReadAt || t.lastMessageAt > t.agentReadAt;
          return (
            <Link key={t.id} href={`/admin/support/${t.id}`} className="flex items-start gap-3 p-4 hover:bg-slate-50">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${t.status === "CLOSED" ? "bg-slate-300" : needs ? "bg-coral-500" : "bg-emerald-500"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{t.user.name} <span className="text-xs font-normal text-slate-500">{t.user.email}</span></p>
                  <p className="text-xs text-slate-500">{formatDateTime(t.lastMessageAt)}</p>
                </div>
                <p className="truncate text-sm text-slate-600">{last ? `${last.sender === "AGENT" ? "You: " : last.sender === "USER" ? "" : ""}${last.body}` : t.subject}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500">{t.status === "WAITING" ? "Waiting for first reply" : t.status === "OPEN" ? (needs ? "New message" : "Answered") : "Closed"}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
