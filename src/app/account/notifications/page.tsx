import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { timeAgo } from "@/lib/dates";
import { EmptyState } from "@/components/ListingCard";
import { markNotificationsReadAction } from "@/app/actions/marketplace";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser("/account/notifications");
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {items.some((n) => !n.readAt) && (
          <form action={markNotificationsReadAction}>
            <button className="btn-ghost btn-sm">Mark all read</button>
          </form>
        )}
      </div>
      {items.length === 0 && <EmptyState title="You're all caught up" />}
      <ul className="space-y-2">
        {items.map((n) => {
          const inner = (
            <div className={`card p-3 ${n.readAt ? "" : "border-ocean-300 bg-ocean-50/60"}`}>
              <div className="flex justify-between gap-2">
                <p className="font-semibold">{n.title}</p>
                <span className="shrink-0 text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
              </div>
              <p className="text-sm text-slate-700">{n.body}</p>
            </div>
          );
          return <li key={n.id}>{n.link ? <Link href={n.link}>{inner}</Link> : inner}</li>;
        })}
      </ul>
    </div>
  );
}
