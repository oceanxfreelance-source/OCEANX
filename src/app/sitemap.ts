import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, categories] = await Promise.all([
    prisma.listing.findMany({ where: { status: "PUBLISHED" }, select: { id: true, updatedAt: true }, orderBy: { publishedAt: "desc" }, take: 5000 }),
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true } }),
  ]);
  const base = env.appUrl;
  return [
    { url: `${base}/`, changeFrequency: "hourly" },
    { url: `${base}/search`, changeFrequency: "hourly" },
    { url: `${base}/vip` },
    { url: `${base}/business` },
    ...categories.map((c) => ({ url: `${base}/search?category=${c.slug}` })),
    ...listings.map((l) => ({ url: `${base}/listing/${l.id}`, lastModified: l.updatedAt })),
  ];
}
