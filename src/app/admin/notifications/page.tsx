import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { PageTitle, Section, TableWrap } from "@/components/admin/ui";
import { AnnouncementForm } from "@/components/admin/AnnouncementForm";

export const metadata = { title: "Notifications" };

export default async function AdminNotificationsPage() {
  await requireAdminPage("content");
  const [devices, accounts, recent, settings] = await Promise.all([
    prisma.pushSubscription.count(),
    prisma.pushSubscription.groupBy({ by: ["userId"], where: { userId: { not: null } } }).then((r) => r.length),
    prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    getSettings(),
  ]);
  return (
    <>
      <PageTitle title="Phone notifications" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs text-slate-500">Browsers & phones subscribed</p><p className="mt-1 text-2xl font-semibold">{devices}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">…of which logged-in customers</p><p className="mt-1 text-2xl font-semibold">{accounts}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">New-item notifications</p><p className="mt-1 text-2xl font-semibold">{settings.notifications.pushNewListings ? "On" : "Off"}</p><p className="text-xs text-slate-500">Change in Settings → Notifications</p></div>
      </div>
      <Section title="Send an announcement to everyone">
        <p className="mb-3 text-sm text-slate-600">Appears as a pop-up notification on every phone and browser that allowed notifications. Android app users get it within about 15 minutes.</p>
        <AnnouncementForm />
      </Section>
      <Section title="Recently sent">
        <TableWrap>
          <table className="table">
            <thead><tr><th>When</th><th>Type</th><th>Notification</th><th>Delivered</th></tr></thead>
            <tbody>
              {recent.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap">{formatDateTime(b.createdAt)}</td>
                  <td>{b.kind === "NEW_LISTING" ? "New item" : "Announcement"}</td>
                  <td><p className="font-medium">{b.title}</p><p className="text-xs text-slate-500">{b.body}</p></td>
                  <td>{b.sentCount}{b.failedCount ? <span className="text-xs text-slate-500"> ({b.failedCount} failed)</span> : null}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500">Nothing sent yet.</td></tr>}
            </tbody>
          </table>
        </TableWrap>
      </Section>
    </>
  );
}
