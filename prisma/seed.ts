import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { ATOLLS, CATEGORIES, LOCATIONS, PLANS, PRIVACY, SELLER_LEVELS, TERMS } from "./seed-data";

const prisma = new PrismaClient();

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function code() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => a[randomInt(0, a.length)]).join("");
}

/** Idempotent: safe to run on every deploy; never overwrites data edited by admins. */
async function main() {
  // Admin roles
  const superRole = await prisma.adminRole.upsert({
    where: { name: "Super Admin" },
    create: { name: "Super Admin", description: "Full access to everything", permissions: ["*"], isSystem: true },
    update: {},
  });
  await prisma.adminRole.upsert({
    where: { name: "Payments Officer" },
    create: { name: "Payments Officer", description: "Reviews payment slips and listings", permissions: ["dashboard", "payments", "listings", "reports"] },
    update: {},
  });
  await prisma.adminRole.upsert({
    where: { name: "Moderator" },
    create: { name: "Moderator", description: "Handles reports and listings", permissions: ["dashboard", "listings", "reports", "users"] },
    update: {},
  });

  // Reference data is only inserted on the first run; afterwards admins own it (and deploys stay fast).
  const seeded = await prisma.siteSetting.findUnique({ where: { key: "_seed" } });
  if (!seeded) {
  // Locations
  for (const [ai, atoll] of ATOLLS.entries()) {
    const a = await prisma.atoll.upsert({ where: { code: atoll.code }, create: { code: atoll.code, name: atoll.name, sortOrder: ai }, update: {} });
    for (const [ii, island] of atoll.islands.entries()) {
      const isl = await prisma.island.upsert({
        where: { atollId_name: { atollId: a.id, name: island } },
        create: { atollId: a.id, name: island, sortOrder: ii },
        update: {},
      });
      for (const [li, loc] of (LOCATIONS[atoll.code]?.[island] ?? []).entries()) {
        await prisma.location.upsert({ where: { islandId_name: { islandId: isl.id, name: loc } }, create: { islandId: isl.id, name: loc, sortOrder: li }, update: {} });
      }
    }
  }

  // Categories
  for (const [ci, c] of CATEGORIES.entries()) {
    const cat = await prisma.category.upsert({ where: { slug: slugify(c.name) }, create: { name: c.name, slug: slugify(c.name), icon: c.icon, sortOrder: ci }, update: {} });
    for (const [si, s] of c.subs.entries()) {
      await prisma.subcategory.upsert({
        where: { categoryId_slug: { categoryId: cat.id, slug: slugify(s) } },
        create: { categoryId: cat.id, name: s, slug: slugify(s), sortOrder: si },
        update: {},
      });
    }
  }

  // Seller levels
  for (const [i, l] of SELLER_LEVELS.entries()) {
    await prisma.sellerLevel.upsert({ where: { slug: l.slug }, create: { ...l, sortOrder: i }, update: {} });
  }

  await prisma.siteSetting.upsert({ where: { key: "_seed" }, create: { key: "_seed", value: { at: new Date().toISOString() } }, update: {} });
  }

  // Subscription plans
  if ((await prisma.subscriptionPlan.count()) === 0) {
    for (const [i, p] of PLANS.entries()) await prisma.subscriptionPlan.create({ data: { ...p, sortOrder: i } });
  }

  // Terms & privacy
  if (!(await prisma.termsDocument.findFirst({ where: { type: "TERMS" } }))) {
    await prisma.termsDocument.create({ data: { type: "TERMS", version: 1, title: "Terms of Use", content: TERMS, isCurrent: true } });
  }
  if (!(await prisma.termsDocument.findFirst({ where: { type: "PRIVACY" } }))) {
    await prisma.termsDocument.create({ data: { type: "PRIVACY", version: 1, title: "Privacy Policy", content: PRIVACY, isCurrent: true } });
  }

  // Welcome banner
  if ((await prisma.banner.count()) === 0) {
    await prisma.banner.create({ data: { title: "List once. Sell across 20 atolls.", subtitle: "No commission on your sale. Post in minutes.", linkUrl: "/sell", background: "#143c5b" } });
  }

  // Super admin (from environment). Log in with ADMIN_USERNAME or ADMIN_EMAIL.
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase() || null;
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim() || (username ? `${username}@admin.mvmarkets.local` : null);
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const existing = await prisma.user.findFirst({ where: { OR: [{ email }, ...(username ? [{ username }] : [])] } });
    if (!existing) {
      const name = process.env.ADMIN_NAME || "OceanX Admin";
      await prisma.user.create({
        data: {
          email,
          username,
          name,
          passwordHash: await bcrypt.hash(password, 12),
          emailVerifiedAt: new Date(),
          referralCode: code(),
          adminRoleId: superRole.id,
          profile: { create: { displayName: name } },
          sellerStats: { create: {} },
          vipStatus: { create: {} },
        },
      });
      console.log(`Created super admin ${username ?? email}`);
    } else if (username && !existing.username) {
      await prisma.user.update({ where: { id: existing.id }, data: { username } });
    }
  }
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
