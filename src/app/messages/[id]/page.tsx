import { Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getConversationForUser } from "@/lib/services/messaging";
import { UserError } from "@/lib/errors";
import { fileUrl } from "@/lib/storage";
import { formatMVR } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { AutoRefresh, ScrollToBottom } from "@/components/AutoRefresh";
import { sendMessageAction } from "@/app/actions/marketplace";

export const metadata = { title: "Chat" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);
  let conv;
  try {
    conv = await getConversationForUser(id, user.id);
  } catch (e) {
    if (e instanceof UserError) notFound();
    throw e;
  }
  const other = conv.buyerId === user.id ? conv.seller : conv.buyer;
  const iAmSeller = conv.sellerId === user.id;
  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <AutoRefresh />
      <ScrollToBottom />
      <div className="card sticky top-[112px] z-10 mb-3 flex items-center gap-3 p-3 md:top-[64px]">
        <Link href="/messages" className="btn-ghost btn-sm" aria-label="Back">←</Link>
        {conv.listing && (
          <Link href={`/listing/${conv.listing.id}`} className="flex min-w-0 flex-1 items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              {conv.listing.images[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(conv.listing.images[0].fileId)!} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{conv.listing.title}</p>
              <p className="text-sm text-ocean-800">{formatMVR(conv.listing.price)} · with {other.name}</p>
            </div>
          </Link>
        )}
        {!iAmSeller && conv.seller.phone && (
          <a href={`tel:${conv.seller.phone}`} className="btn-secondary btn-sm" aria-label="Call seller"><Phone className="h-4 w-4" /></a>
        )}
      </div>
      <ul className="flex-1 space-y-2">
        {conv.messages.map((m) => {
          const mine = m.senderId === user.id;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${mine ? "rounded-br-sm bg-ocean-700 text-white" : "rounded-bl-sm bg-surface"}`}>
                <p className="whitespace-pre-line break-words">{m.body}</p>
                <p className={`mt-0.5 text-[10px] ${mine ? "text-ocean-100" : "text-slate-400"}`}>{formatDateTime(m.createdAt)}{mine && m.readAt ? " · Seen" : ""}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <div id="chat-end" />
      <div className="sticky bottom-16 mt-3 md:bottom-2">
        <ActionForm action={sendMessageAction} resetOnSuccess className="card p-2">
          <input type="hidden" name="conversationId" value={conv.id} />
          <div className="flex gap-2">
            <textarea name="body" rows={1} required maxLength={2000} className="input flex-1 resize-none" placeholder="Write a message…" aria-label="Message" />
            <SubmitButton className="btn-primary">Send</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
