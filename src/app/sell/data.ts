import "server-only";
import { prisma } from "@/lib/db";
import { getActiveCategories, getActiveLocations, getSiteSettings } from "@/lib/site";
import { CONDITIONS } from "@/lib/services/listings";

export async function sellFormData(userId: string) {
  const [categories, atolls, businesses, settings] = await Promise.all([
    getActiveCategories(),
    getActiveLocations(),
    prisma.business.findMany({ where: { ownerId: userId, status: "ACTIVE" }, select: { id: true, name: true } }),
    getSiteSettings(),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, subcategories: c.subcategories.map((s) => ({ id: s.id, name: s.name })) })),
    atolls: atolls.map((a) => ({ id: a.id, name: a.name, islands: a.islands.map((i) => ({ id: i.id, name: i.name, locations: i.locations.map((l) => ({ id: l.id, name: l.name })) })) })),
    businesses,
    conditions: CONDITIONS,
    maxImages: settings.general.maxImagesPerListing,
    settings,
  };
}
