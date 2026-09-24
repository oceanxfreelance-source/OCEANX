import Link from "next/link";
import type { ListingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { fileUrl } from "@/lib/storage";
import { formatMVR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/badges";
import { EmptyState } from "@/components/ListingCard";

export const metadata = { title: "My listings" };

const TABS: { key: string; label: string; statuses: ListingStatus[] }[] = [
  { key: "live", label: "Live", statuses: ["PUBLISHED", "PAYMENT_REVIEW"] },
  { key: "drafts", label: "Unpublished", statuses: ["DRAFT", "PENDING_PAYMENT", "REJECTED"] },
  { key: "sold", label: "Sold", statuses: ["SOLD"] },
  { key: "closed", label: "Withdrawn / removed", statuses: ["WITHDRAWN", "REMOVED"] },
];

export default async function MyListingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; sold?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/account/listings");
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const [listings, counts] = await Promise.all([
    prisma.listing.findMany({
      where: { sellerId: user.id, status: { in: tab.statuses } },
      orderBy: { updatedAt: "desc" },
      include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, deal: true, _count: { select: { savedBy: true, conversations: true } } },
    }),
    prisma.listing.groupBy({ by: ["status"], where: { sellerId: user.id }, _count: true }),
  ]);
  const count = (t: (typeof TABS)[number]) => counts.filter((c) => t.statuses.includes(c.status)).reduce((a, c) => a + c._count, 0);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">My listings</h1>
        <Link href="/sell" className="btn-accent btn-sm">+ New</Link>
      </div>
      {sp.sold && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Marked as sold. Congratulations on your sale! 🎉</p>}
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <Link key={t.key} href={`/account/listings?tab=${t.key}`} className={t.key === tab.key ? "btn-primary btn-sm shrink-0" : "btn-secondary btn-sm shrink-0"}>
            {t.label} ({count(t)})
          </Link>
        ))}
      </div>
      {listings.length === 0 ? (
        <EmptyState title="Nothing here yet" />
      ) : (
        <ul className="space-y-3">
          {listings.map((l) => (
            <li key={l.id} className="card flex gap-3 p-3">
              <Link href={`/listing/${l.id}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                {l.images[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(l.images[0].fileId)!} alt="" className="h-full w-full object-cover" />
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={l.status} />
                  {l.deal && <StatusBadge status={l.deal.status} labels={{ PENDING_CONFIRMATION: "Buyer to confirm", CONFIRMED: "Deal confirmed", UNCONFIRMED: "No buyer confirmation" }} />}
                </div>
                <Link href={`/listing/${l.id}`} className="mt-1 block truncate font-semibold">{l.title}</Link>
                <p className="text-sm text-slate-600">
                  {formatMVR(l.price)} · {l.viewCount} views · {l._count.savedBy} saves · {l._count.conversations} chats
                </p>
                <p className="text-xs text-slate-400">{l.publishedAt ? `Published ${formatDate(l.publishedAt)}` : `Created ${formatDate(l.createdAt)}`}</p>
                {l.status === "REMOVED" && l.removedReason && <p className="text-xs text-red-700">Removed: {l.removedReason}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {l.status === "PUBLISHED" && (
                    <>
                      <Link href={`/account/listings/${l.id}/sold`} className="btn-primary btn-sm">✓ Mark as sold</Link>
                      <Link href={`/account/listings/${l.id}/edit`} className="btn-secondary btn-sm">Edit</Link>
                      <Link href={`/account/listings/${l.id}/withdraw`} className="btn-ghost btn-sm text-red-600">Withdraw</Link>
                    </>
                  )}
                  {l.status === "DRAFT" && <Link href={`/sell/${l.id}/preview`} className="btn-primary btn-sm">Continue</Link>}
                  {["PENDING_PAYMENT", "REJECTED"].includes(l.status) && <Link href={`/sell/${l.id}/pay`} className="btn-accent btn-sm">Pay & publish</Link>}
                  {["DRAFT", "PENDING_PAYMENT", "REJECTED"].includes(l.status) && <Link href={`/sell/${l.id}/edit`} className="btn-secondary btn-sm">Edit</Link>}
                  {l.status === "PAYMENT_REVIEW" && <Link href="/account/payments" className="btn-secondary btn-sm">View payment</Link>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
