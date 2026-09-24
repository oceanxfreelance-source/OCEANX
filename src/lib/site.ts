import "server-only";
import { cache } from "react";
import { getSettings } from "./settings";
import { prisma } from "./db";

/** Settings memoised per request for use across server components. */
export const getSiteSettings = cache(async () => getSettings());

export const getActiveCategories = cache(async () =>
  prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { subcategories: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  }),
);

export const getActiveLocations = cache(async () =>
  prisma.atoll.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      islands: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { locations: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
      },
    },
  }),
);

export type LocationTree = Awaited<ReturnType<typeof getActiveLocations>>;
export type CategoryTree = Awaited<ReturnType<typeof getActiveCategories>>;
