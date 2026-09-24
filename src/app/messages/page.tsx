import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { listConversations } from "@/lib/services/messaging";
import { fileUrl } from "@/lib/storage";
import { timeAgo } from "@/lib/dates";
import { EmptyState } from "@/components/ListingCard";

export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  const user = await requireUser("/messages");
  const convs = await listConversations(user.id);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">Messages</h1>
      {convs.length === 0 && <EmptyState title="No conversations yet">Message a seller from any listing to start chatting.</EmptyState>}
      <ul className="space-y-2">
        {convs.map((c) => {
          const other = c.buyerId === user.id ? c.seller : c.buyer;
          const last = c.messages[0];
          const unread = c._count.messages;
          return (
            <li key={c.id}>
              <Link href={`/messages/${c.id}`} className={`card flex items-center gap-3 p-3 ${unread ? "border-ocean-300" : ""}`}>
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {c.listing?.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(c.listing.images[0].fileId)!} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <p className="truncate font-semibold">{other.name}</p>
                    {last && <span className="shrink-0 text-xs text-slate-400">{timeAgo(last.createdAt)}</span>}
                  </div>
                  <p className="truncate text-xs text-ocean-700">{c.listing?.title ?? "Listing removed"}</p>
                  <p className={`truncate text-sm ${unread ? "font-semibold text-slate-900" : "text-slate-500"}`}>{last ? `${last.senderId === user.id ? "You: " : ""}${last.body}` : ""}</p>
                </div>
                {unread > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-coral-500 px-1.5 text-xs font-bold text-white">{unread}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
