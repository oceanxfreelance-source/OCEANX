import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { threadForAgent } from "@/lib/services/support";
import { PageTitle } from "@/components/admin/ui";
import { AgentChat } from "@/components/admin/AgentChat";

export const metadata = { title: "Support chat" };
export const dynamic = "force-dynamic";

export default async function AdminSupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("support");
  const { id } = await params;
  const t = await threadForAgent(id).catch(() => null);
  if (!t) notFound();
  return (
    <>
      <Link href="/admin/support" className="text-sm text-ocean-700">← All chats</Link>
      <PageTitle title={`Chat with ${t.user.name}`} />
      <p className="-mt-2 text-sm text-slate-500">
        {t.user.email}
        {t.user.phone ? ` · ${t.user.phone}` : ""} · <Link href={`/admin/users/${t.user.id}`} className="underline">View customer</Link>
      </p>
      <AgentChat
        initial={{ id: t.id, status: t.status, messages: t.messages.map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt.toISOString() })) }}
        customerName={t.user.name}
      />
    </>
  );
}
