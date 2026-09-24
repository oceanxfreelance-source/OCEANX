import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { searchListings, searchWords } from "@/lib/services/listings";
import { makeUser, resetSettings, publishedListing } from "./helpers";

beforeAll(resetSettings);

describe("search", () => {
  it("reduces plurals", () => {
    expect(searchWords("Cars  phones, batteries glass")).toEqual(["car", "phone", "battery", "glass"]);
  });

  it("finds items by category name, not only by title", async () => {
    const u = await makeUser();
    const cars = await prisma.subcategory.findFirstOrThrow({ where: { name: "Cars" }, include: { category: true } });
    const tag = Math.random().toString(36).slice(2, 8);
    const l = await publishedListing(u.id, { title: `Toyota Axio 2018 ${tag}`, description: "Low mileage, single owner, full service history.", categoryId: cars.categoryId, subcategoryId: cars.id });
    for (const q of ["car", "cars", "CARS", "vehicle"]) {
      const r = await searchListings({ q });
      expect(r.items.map((i) => i.id), q).toContain(l.id);
    }
    // All words must match when possible…
    expect((await searchListings({ q: `car ${tag}` })).items.map((i) => i.id)).toEqual([l.id]);
    // …otherwise fall back to any word rather than showing nothing.
    const relaxed = await searchListings({ q: `${tag} zzqqxxnomatch` });
    expect(relaxed.relaxed).toBe(true);
    expect(relaxed.items.map((i) => i.id)).toContain(l.id);
  });
});
