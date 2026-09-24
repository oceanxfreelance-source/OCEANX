import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/** Public pages for search engines. Always uses the stable public domain, never a per-deployment URL. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl;
  const now = new Date();
  const [listings, categories, businesses] = await Promise.all([
    prisma.listing.findMany({ where: { status: "PUBLISHED", seller: { status: "ACTIVE" } }, select: { id: true, updatedAt: true }, orderBy: { publishedAt: "desc" }, take: 45000 }),
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true, subcategories: { where: { isActive: true }, select: { slug: true } } } }),
    prisma.business.findMany({ where: { status: "ACTIVE", subscriptions: { some: { status: "ACTIVE", endsAt: { gt: now } } } }, select: { slug: true, updatedAt: true } }),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1, lastModified: now },
    { url: `${base}/search`, changeFrequency: "hourly", priority: 0.8, lastModified: now },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/app`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/vip`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/business`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/giveaways`, changeFrequency: "weekly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.1 },
    ...categories.flatMap((c) => [
      { url: `${base}/search?category=${c.slug}`, changeFrequency: "daily" as const, priority: 0.7, lastModified: c.updatedAt },
      ...c.subcategories.map((s) => ({ url: `${base}/search?category=${c.slug}&sub=${s.slug}`, changeFrequency: "daily" as const, priority: 0.5 })),
    ]),
    ...businesses.map((b) => ({ url: `${base}/business/${b.slug}`, changeFrequency: "daily" as const, priority: 0.6, lastModified: b.updatedAt })),
    ...listings.map((l) => ({ url: `${base}/listing/${l.id}`, changeFrequency: "daily" as const, priority: 0.9, lastModified: l.updatedAt })),
  ];
}
