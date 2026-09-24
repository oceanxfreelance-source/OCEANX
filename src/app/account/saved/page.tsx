import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { listingCardSelect } from "@/lib/services/listings";
import { getSiteSettings } from "@/lib/site";
import { ListingGrid, EmptyState } from "@/components/ListingCard";

export const metadata = { title: "Saved items" };

export default async function SavedPage() {
  const user = await requireUser("/account/saved");
  const settings = await getSiteSettings();
  const saved = await prisma.savedListing.findMany({ where: { userId: user.id, listing: { status: { in: ["PUBLISHED", "SOLD"] } } }, orderBy: { createdAt: "desc" }, include: { listing: { select: listingCardSelect } } });
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Saved items</h1>
      {saved.length ? <ListingGrid items={saved.map((s) => s.listing)} vipLabel={settings.vip.badgeName} /> : <EmptyState title="No saved items">Use Save item on any listing to keep it here.</EmptyState>}
    </div>
  );
}
