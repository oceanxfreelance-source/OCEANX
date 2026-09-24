import sharp from "sharp";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { referralCode } from "@/lib/crypto";
import { saveFile } from "@/lib/storage";
import { processImage } from "@/lib/images";
import { updateSettingsGroup, defaultSettings, SETTINGS_GROUPS } from "@/lib/settings";
import { testOutbox } from "@/lib/messaging-providers";
import { createListingDraft, submitListing } from "@/lib/services/listings";
import { submitPayment, adminVerifyPayment } from "@/lib/services/payments";

let n = 0;
export async function makeUser(opts: { verified?: boolean; ageDays?: number; name?: string; admin?: boolean } = {}) {
  n++;
  const createdAt = new Date(Date.now() - (opts.ageDays ?? 30) * 86400000);
  const role = opts.admin ? await prisma.adminRole.findFirst({ where: { permissions: { has: "*" } } }) : null;
  return prisma.user.create({
    data: {
      email: `user${n}-${Date.now()}@test.mv`,
      name: opts.name ?? `User ${n}`,
      passwordHash: await hashPassword("password123"),
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      referralCode: referralCode(),
      createdAt,
      adminRoleId: role?.id ?? null,
      profile: { create: {} },
      sellerStats: { create: {} },
      vipStatus: { create: {} },
    },
  });
}

export async function testImage(color = "#0e7490", size = 400): Promise<Buffer> {
  return sharp({ create: { width: size, height: size, channels: 3, background: color } }).jpeg().toBuffer();
}

/** Unique, visually distinct image (used for payment slips so perceptual hashes differ). */
export async function noisyImage(seed: number): Promise<Buffer> {
  // 9x8 random cells line up with the 64-bit difference hash, so every test slip is visually distinct.
  const w = 9, h = 8;
  const raw = Buffer.alloc(w * h * 3);
  let x = seed * 9301 + 49297;
  for (let i = 0; i < raw.length; i++) {
    x = (x * 9301 + 49297) % 233280;
    raw[i] = Math.floor((x / 233280) * 255);
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).resize(300, 300, { kernel: "nearest" }).png().toBuffer();
}

export async function uploadListingImage(userId: string, color?: string) {
  const img = await processImage(await testImage(color));
  return saveFile({ buffer: img.buffer, mimeType: img.mimeType, visibility: "PUBLIC", purpose: "listing_image", ownerId: userId, width: img.width, height: img.height });
}

export async function refData() {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "phones" }, include: { subcategories: true } });
  const atoll = await prisma.atoll.findFirstOrThrow({ where: { code: "MLE" }, include: { islands: { include: { locations: true } } } });
  const island = atoll.islands.find((i) => i.name === "Malé")!;
  return { category, sub: category.subcategories[0], atoll, island, location: island.locations[0] };
}

export async function listingInput(userId: string, overrides: Record<string, unknown> = {}) {
  const r = await refData();
  const img = await uploadListingImage(userId);
  return {
    title: `iPhone 13 Pro ${Math.random().toString(36).slice(2, 7)}`,
    description: "Excellent condition, battery health 90%, comes with box.",
    price: "8500",
    negotiable: true,
    condition: "LIKE_NEW" as const,
    categoryId: r.category.id,
    subcategoryId: r.sub.id,
    atollId: r.atoll.id,
    islandId: r.island.id,
    locationId: r.location.id,
    locationDetail: "Near Majeedhee Magu",
    contactPhone: "7771234",
    contactWhatsapp: "",
    contactEmail: "",
    showPhone: true,
    businessId: null,
    imageIds: [img.id],
    ...overrides,
  };
}

export async function resetSettings() {
  const d = defaultSettings();
  for (const k of SETTINGS_GROUPS) await updateSettingsGroup(k, d[k], null);
}

export function lastOtp(to: string): string | null {
  for (let i = testOutbox.length - 1; i >= 0; i--) {
    const m = testOutbox[i];
    if (m.to === to) return m.body.match(/\b(\d{6})\b/)?.[1] ?? null;
  }
  return null;
}

export const today = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
let slipSeed = Math.floor(Math.random() * 1e9);
export async function slip() {
  return { buffer: await noisyImage(slipSeed++), mimeType: "image/png" };
}

export async function publishedListing(sellerId: string, overrides: Record<string, unknown> = {}) {
  const admin = await makeUser({ admin: true });
  const l = await createListingDraft(sellerId, await listingInput(sellerId, overrides));
  await submitListing(l.id, sellerId);
  const pay = await submitPayment(sellerId, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: `REF${Date.now()}${Math.random()}`.slice(0, 30), paidAt: today() }, await slip());
  await adminVerifyPayment(pay.paymentId, admin.id, "");
  return prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
}

