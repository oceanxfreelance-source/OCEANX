import { z } from "zod";
import { prisma, type Tx } from "./db";

/**
 * Every business rule OceanX can change from the Admin Dashboard lives here.
 * Values are stored in the SiteSetting table (one row per group) and merged over these defaults,
 * so nothing is hard-coded in application logic. Money values are integer laari.
 */

const general = z.object({
  marketplaceName: z.string().min(1).max(60).default("MV MARKETS"),
  tagline: z.string().max(80).default("by OceanX"),
  logoFileId: z.string().nullable().default(null),
  supportEmail: z.string().email().or(z.literal("")).default("support@mvmarkets.mv"),
  supportPhone: z.string().max(30).default(""),
  maxImagesPerListing: z.number().int().min(1).max(20).default(8),
  maxActiveListingsPerUser: z.number().int().min(1).max(10000).default(200),
  maxListingsCreatedPerDay: z.number().int().min(1).max(1000).default(20),
  maintenanceMode: z.boolean().default(false),
  seoDescription: z
    .string()
    .max(300)
    .default("MV Markets is the Maldives marketplace to buy and sell phones, vehicles, property, furniture and more across every atoll. No commission on your sale."),
  googleSiteVerification: z.string().max(200).default(""),
});

const fees = z.object({
  postingFee: z.number().int().min(0).default(2000),
  vipPostingFee: z.number().int().min(0).default(1000),
});

const payment = z.object({
  bankName: z.string().default("Bank of Maldives"),
  accountName: z.string().default("OceanX Pvt Ltd"),
  accountNumber: z.string().default("7730000000000"),
  secondaryBankName: z.string().default(""),
  secondaryAccountName: z.string().default(""),
  secondaryAccountNumber: z.string().default(""),
  instructions: z
    .string()
    .default("Transfer the exact amount to the account above, then upload a clear screenshot or PDF of the transfer slip."),
  aiScreeningEnabled: z.boolean().default(true),
  aiAutoApprove: z.boolean().default(false),
  aiConfidenceThreshold: z.number().min(0).max(1).default(0.9),
  maxSlipAgeDays: z.number().int().min(1).max(365).default(14),
});

const deals = z.object({
  /** confirmed_only: only buyer-confirmed deals count. include_unconfirmed: seller-only SOLD marks count too. */
  countingMode: z.enum(["confirmed_only", "include_unconfirmed"]).default("confirmed_only"),
  autoConfirmDays: z.number().int().min(0).max(90).default(7),
  minHoursPublishedBeforeSale: z.number().int().min(0).max(720).default(12),
  minDealPrice: z.number().int().min(0).default(0),
  maxCountedDealsPerDay: z.number().int().min(1).max(1000).default(5),
  maxDealsSamePairPer30Days: z.number().int().min(1).max(100).default(2),
  buyerMinAccountAgeDays: z.number().int().min(0).max(365).default(2),
});

const stars = z.object({
  starsPerDeal: z.number().int().min(0).max(100).default(1),
});

const vip = z.object({
  enabled: z.boolean().default(true),
  durationMonths: z.number().int().min(1).max(24).default(2),
  minStars: z.number().int().min(0).default(10),
  minDealsTotal: z.number().int().min(0).default(10),
  windowDays: z.number().int().min(7).max(365).default(60),
  minDealsInWindow: z.number().int().min(0).default(3),
  maxCancellationsInWindow: z.number().int().min(0).default(3),
  requireAdminApproval: z.boolean().default(false),
  badgeName: z.string().min(1).max(30).default("VIP"),
  badgeDescription: z.string().max(300).default("Top active seller on MV Markets, earned through genuine completed sales."),
  benefits: z
    .array(z.string().max(200))
    .default([
      "50% discount on every listing posting fee",
      "VIP badge on your profile and listings",
      "Eligible for the monthly VIP reward pool",
    ]),
});

const cancellation = z.object({
  enabled: z.boolean().default(true),
  fineAmount: z.number().int().min(0).default(1000),
  graceHours: z.number().int().min(0).max(720).default(0),
  allowExceptionRequests: z.boolean().default(true),
  maxPerPeriod: z.number().int().min(1).max(100).default(3),
  periodDays: z.number().int().min(1).max(365).default(30),
  reduceStars: z.boolean().default(true),
  starPenalty: z.number().int().min(0).max(100).default(1),
  affectsVipEligibility: z.boolean().default(true),
  suspendVipOverLimit: z.boolean().default(false),
  triggerReviewOverLimit: z.boolean().default(true),
  warnOverLimit: z.boolean().default(true),
  reduceLevelOverLimit: z.boolean().default(false),
  blockPostingWithUnpaidFines: z.boolean().default(true),
});

const referrals = z.object({
  enabled: z.boolean().default(false),
  starsPerVerifiedReferral: z.number().int().min(0).max(100).default(1),
  requireReferredPublishedListing: z.boolean().default(true),
});

const rewards = z.object({
  defaultPercent: z.number().min(0).max(100).default(20),
  method: z.enum(["weighted", "equal"]).default("weighted"),
  weights: z
    .object({
      deals: z.number().min(0).default(60),
      listings: z.number().min(0).default(10),
      referrals: z.number().min(0).default(20),
      stars: z.number().min(0).default(10),
    })
    .default({}),
  minDealsInMonth: z.number().int().min(0).default(0),
  requireActiveVipAtMonthEnd: z.boolean().default(true),
});

const homepage = z.object({
  heroTitle: z.string().max(120).default("Buy & sell anything across the Maldives"),
  heroSubtitle: z.string().max(240).default("From Malé to Addu — list in minutes, reach buyers on every atoll."),
  announcement: z.string().max(240).default(""),
  showCategories: z.boolean().default(true),
  showFeatured: z.boolean().default(true),
  recentCount: z.number().int().min(4).max(48).default(12),
});

const notifications = z.object({
  emailEnabled: z.boolean().default(true),
  events: z
    .object({
      paymentVerified: z.boolean().default(true),
      paymentRejected: z.boolean().default(true),
      listingPublished: z.boolean().default(true),
      newMessage: z.boolean().default(false),
      vip: z.boolean().default(true),
      rewards: z.boolean().default(true),
      cancellation: z.boolean().default(true),
      deals: z.boolean().default(true),
    })
    .default({}),
});

const business = z.object({
  enabled: z.boolean().default(true),
  requireVerifiedForStorefront: z.boolean().default(false),
});

const moderation = z.object({
  autoHideReportThreshold: z.number().int().min(0).max(100).default(0),
});

export const settingsSchema = {
  general,
  fees,
  payment,
  deals,
  stars,
  vip,
  cancellation,
  referrals,
  rewards,
  homepage,
  notifications,
  business,
  moderation,
} as const;

export type SettingsGroup = keyof typeof settingsSchema;
export type Settings = { [K in SettingsGroup]: z.infer<(typeof settingsSchema)[K]> };
export const SETTINGS_GROUPS = Object.keys(settingsSchema) as SettingsGroup[];

export function defaultSettings(): Settings {
  const out = {} as Record<string, unknown>;
  for (const key of SETTINGS_GROUPS) out[key] = settingsSchema[key].parse({});
  return out as Settings;
}

export async function getSettings(db: Tx = prisma): Promise<Settings> {
  const rows = await db.siteSetting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<string, unknown>;
  for (const key of SETTINGS_GROUPS) {
    const stored = byKey.get(key);
    const parsed = settingsSchema[key].safeParse(stored ?? {});
    out[key] = parsed.success ? parsed.data : settingsSchema[key].parse({});
  }
  return out as Settings;
}

export async function updateSettingsGroup<K extends SettingsGroup>(
  key: K,
  value: unknown,
  actorId: string | null,
  db: Tx = prisma,
): Promise<Settings[K]> {
  const parsed = settingsSchema[key].parse(value) as Settings[K];
  await db.siteSetting.upsert({
    where: { key },
    create: { key, value: parsed as object, updatedBy: actorId },
    update: { value: parsed as object, updatedBy: actorId },
  });
  return parsed;
}
