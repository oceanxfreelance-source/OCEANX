import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { markListingSold, confirmDeal, disputeDeal, autoConfirmDeals, adminReviewDeal } from "@/lib/services/deals";
import { startConversation } from "@/lib/services/messaging";
import { recomputeSellerStats, adjustStars } from "@/lib/services/reputation";
import { evaluateVip, vipEligibility, runVipMaintenance, adminSuspendVip, adminRestoreVip, isVipActive } from "@/lib/services/vip";
import { quotePostingFee } from "@/lib/services/fees";
import { getSettings, updateSettingsGroup } from "@/lib/settings";
import { makeUser, publishedListing, resetSettings } from "./helpers";

async function setRules() {
  await resetSettings();
  const s = await getSettings();
  // Small thresholds so tests stay fast; the defaults are larger.
  await updateSettingsGroup("deals", { ...s.deals, minHoursPublishedBeforeSale: 0, maxCountedDealsPerDay: 50, maxDealsSamePairPer30Days: 50, buyerMinAccountAgeDays: 0 }, null);
  await updateSettingsGroup("vip", { ...s.vip, minStars: 3, minDealsTotal: 3, minDealsInWindow: 2, windowDays: 60, maxCancellationsInWindow: 1 }, null);
}

async function sellTo(sellerId: string, buyerId: string) {
  const l = await publishedListing(sellerId);
  await startConversation(buyerId, l.id, "Is this available?");
  const deal = await markListingSold(l.id, sellerId, buyerId);
  return { listing: l, deal };
}

beforeAll(setRules);

describe("SOLD system and successful deals", () => {
  beforeEach(setRules);

  it("marking SOLD hides the listing from default search, keeps history and records a deal", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const { listing, deal } = await sellTo(seller.id, buyer.id);
    const l = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(l.status).toBe("SOLD");
    expect(l.soldAt).not.toBeNull();
    expect(deal.status).toBe("PENDING_CONFIRMATION");
    expect(deal.countsTowardStats).toBe(true);
    // pending deals do not yet count (confirmed_only mode)
    let stats = await recomputeSellerStats(seller.id);
    expect(stats.countedDeals).toBe(0);
    expect(stats.pendingDeals).toBe(1);
    await confirmDeal(deal.id, buyer.id);
    stats = await recomputeSellerStats(seller.id);
    expect(stats.countedDeals).toBe(1);
    expect(stats.stars).toBe(1);
    expect(stats.soldListings).toBe(1);
  });

  it("buyer must be someone who messaged about the listing, and not the seller", async () => {
    const seller = await makeUser();
    const stranger = await makeUser();
    const l = await publishedListing(seller.id);
    await expect(markListingSold(l.id, seller.id, stranger.id)).rejects.toThrow(/contacted you/);
    await expect(markListingSold(l.id, seller.id, seller.id)).rejects.toThrow(/own listing/);
  });

  it("seller-only SOLD marks do not count unless the admin enables it", async () => {
    const seller = await makeUser();
    const l = await publishedListing(seller.id);
    const deal = await markListingSold(l.id, seller.id, null);
    expect(deal.status).toBe("UNCONFIRMED");
    expect((await recomputeSellerStats(seller.id)).countedDeals).toBe(0);
    const s = await getSettings();
    await updateSettingsGroup("deals", { ...s.deals, countingMode: "include_unconfirmed" }, null);
    expect((await recomputeSellerStats(seller.id)).countedDeals).toBe(1);
  });

  it("anti-manipulation: too-fast sales, daily caps and repeated same-buyer deals don't count", async () => {
    const s = await getSettings();
    await updateSettingsGroup("deals", { ...s.deals, minHoursPublishedBeforeSale: 24, maxCountedDealsPerDay: 50, maxDealsSamePairPer30Days: 1 }, null);
    const seller = await makeUser();
    const buyer = await makeUser();
    const { deal } = await sellTo(seller.id, buyer.id);
    expect(deal.countsTowardStats).toBe(false);
    expect(deal.ineligibleReason).toMatch(/within 24 hours/);

    await updateSettingsGroup("deals", { ...s.deals, minHoursPublishedBeforeSale: 0, maxDealsSamePairPer30Days: 1, maxCountedDealsPerDay: 50 }, null);
    const d2 = (await sellTo(seller.id, buyer.id)).deal;
    expect(d2.countsTowardStats).toBe(true);
    const d3 = (await sellTo(seller.id, buyer.id)).deal;
    expect(d3.countsTowardStats).toBe(false);
    expect(d3.ineligibleReason).toMatch(/same buyer/);

    await updateSettingsGroup("deals", { ...s.deals, minHoursPublishedBeforeSale: 0, maxDealsSamePairPer30Days: 50, maxCountedDealsPerDay: 1 }, null);
    const other = await makeUser();
    const d4 = (await sellTo(seller.id, other.id)).deal;
    expect(d4.ineligibleReason).toMatch(/Daily limit/);
  });

  it("new buyer accounts are not counted; buyer disputes stop the deal counting; admin can review", async () => {
    const s = await getSettings();
    await updateSettingsGroup("deals", { ...s.deals, buyerMinAccountAgeDays: 3 }, null);
    const seller = await makeUser();
    const fresh = await makeUser({ ageDays: 0 });
    const { deal } = await sellTo(seller.id, fresh.id);
    expect(deal.countsTowardStats).toBe(false);

    await updateSettingsGroup("deals", { ...s.deals, buyerMinAccountAgeDays: 0 }, null);
    const buyer = await makeUser();
    const d2 = (await sellTo(seller.id, buyer.id)).deal;
    await disputeDeal(d2.id, buyer.id, "I never bought this");
    expect((await prisma.successfulDeal.findUniqueOrThrow({ where: { id: d2.id } })).status).toBe("DISPUTED");
    expect((await recomputeSellerStats(seller.id)).countedDeals).toBe(0);
    const admin = await makeUser({ admin: true });
    await adminReviewDeal(d2.id, admin.id, "confirm", "Buyer confirmed by phone");
    expect((await recomputeSellerStats(seller.id)).countedDeals).toBe(1);
    await adminReviewDeal(d2.id, admin.id, "void", "Found to be fake");
    expect((await recomputeSellerStats(seller.id)).countedDeals).toBe(0);
  });

  it("pending confirmations auto-confirm after the configured number of days", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const { deal } = await sellTo(seller.id, buyer.id);
    await prisma.successfulDeal.update({ where: { id: deal.id }, data: { createdAt: new Date(Date.now() - 8 * 86400000) } });
    expect(await autoConfirmDeals()).toBeGreaterThanOrEqual(1);
    expect((await prisma.successfulDeal.findUniqueOrThrow({ where: { id: deal.id } })).status).toBe("CONFIRMED");
  });

  it("mass posting does not earn Stars — only genuine deals do", async () => {
    const seller = await makeUser();
    for (let i = 0; i < 4; i++) await publishedListing(seller.id);
    const stats = await recomputeSellerStats(seller.id);
    expect(stats.publishedListings).toBe(4);
    expect(stats.stars).toBe(0);
    expect((await vipEligibility(seller.id)).eligible).toBe(false);
  });

  it("seller levels follow Stars and deals and are configurable", async () => {
    const seller = await makeUser();
    await adjustStars(seller.id, 5, "Test", seller.id);
    let stats = await prisma.sellerStatistics.findUniqueOrThrow({ where: { userId: seller.id }, include: { level: true } });
    expect(stats.level?.slug).toBe("new-seller"); // Active Seller also needs 3 deals
    await prisma.sellerLevel.update({ where: { slug: "active-seller" }, data: { minDeals: 0 } });
    await recomputeSellerStats(seller.id);
    stats = await prisma.sellerStatistics.findUniqueOrThrow({ where: { userId: seller.id }, include: { level: true } });
    expect(stats.level?.slug).toBe("active-seller");
    await prisma.sellerLevel.update({ where: { slug: "active-seller" }, data: { minDeals: 3 } });
  });
});

describe("VIP lifecycle", () => {
  beforeEach(setRules);

  it("qualifies automatically after genuine deals, gets VIP fee, and appears in history", async () => {
    const seller = await makeUser();
    for (let i = 0; i < 3; i++) {
      const buyer = await makeUser();
      const { deal } = await sellTo(seller.id, buyer.id);
      await confirmDeal(deal.id, buyer.id);
    }
    const vip = await prisma.vipStatus.findUniqueOrThrow({ where: { userId: seller.id } });
    expect(vip.state).toBe("ACTIVE");
    // ~2 months duration
    const months = (vip.expiresAt!.getTime() - vip.since!.getTime()) / (86400000 * 30);
    expect(months).toBeGreaterThan(1.9);
    expect(months).toBeLessThan(2.1);
    expect(await isVipActive(seller.id)).toBe(true);
    expect((await quotePostingFee(seller.id)).amount).toBe(1000);
    expect(await prisma.vipHistory.count({ where: { userId: seller.id, event: "GRANTED" } })).toBe(1);
  });

  it("renews at expiry when still active, expires otherwise (fee returns to MVR 20)", async () => {
    const active = await makeUser();
    for (let i = 0; i < 3; i++) {
      const b = await makeUser();
      await confirmDeal((await sellTo(active.id, b.id)).deal.id, b.id);
    }
    await prisma.vipStatus.update({ where: { userId: active.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await runVipMaintenance();
    const renewed = await prisma.vipStatus.findUniqueOrThrow({ where: { userId: active.id } });
    expect(renewed.state).toBe("ACTIVE");
    expect(renewed.renewals).toBe(1);
    expect(renewed.expiresAt!.getTime()).toBeGreaterThan(Date.now());

    // Make their deals old → no recent activity → expire
    await prisma.successfulDeal.updateMany({ where: { sellerId: active.id }, data: { createdAt: new Date(Date.now() - 90 * 86400000) } });
    await prisma.vipStatus.update({ where: { userId: active.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await runVipMaintenance();
    const expired = await prisma.vipStatus.findUniqueOrThrow({ where: { userId: active.id } });
    expect(expired.state).toBe("EXPIRED");
    expect((await quotePostingFee(active.id)).amount).toBe(2000);
    expect(await prisma.vipHistory.count({ where: { userId: active.id, event: { in: ["RENEWED", "EXPIRED"] } } })).toBe(2);
  });

  it("admin approval mode puts qualified users in a queue", async () => {
    const s = await getSettings();
    await updateSettingsGroup("vip", { ...s.vip, requireAdminApproval: true }, null);
    const seller = await makeUser();
    for (let i = 0; i < 3; i++) {
      const b = await makeUser();
      await confirmDeal((await sellTo(seller.id, b.id)).deal.id, b.id);
    }
    expect((await prisma.vipStatus.findUniqueOrThrow({ where: { userId: seller.id } })).state).toBe("PENDING_APPROVAL");
    const { adminApproveVip } = await import("@/lib/services/vip");
    const admin = await makeUser({ admin: true });
    await adminApproveVip(seller.id, admin.id, "Looks genuine");
    expect((await prisma.vipStatus.findUniqueOrThrow({ where: { userId: seller.id } })).state).toBe("ACTIVE");
  });

  it("admin can suspend and restore VIP with reasons (audited)", async () => {
    const seller = await makeUser();
    const admin = await makeUser({ admin: true });
    await prisma.vipStatus.update({ where: { userId: seller.id }, data: { state: "ACTIVE", since: new Date(), expiresAt: new Date(Date.now() + 10 * 86400000) } });
    await expect(adminSuspendVip(seller.id, admin.id, "")).rejects.toThrow(/reason/);
    await adminSuspendVip(seller.id, admin.id, "Investigating reports");
    expect(await isVipActive(seller.id)).toBe(false);
    expect((await quotePostingFee(seller.id)).amount).toBe(2000);
    expect(await evaluateVip(seller.id)).toBe("SUSPENDED"); // automatic evaluation never overrides a suspension
    await adminRestoreVip(seller.id, admin.id, "Resolved");
    expect(await isVipActive(seller.id)).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityId: seller.id, action: { in: ["vip.suspend", "vip.restore"] } } })).toBe(2);
  });

  it("VIP can be disabled globally by admin", async () => {
    const seller = await makeUser();
    await prisma.vipStatus.update({ where: { userId: seller.id }, data: { state: "ACTIVE", since: new Date(), expiresAt: new Date(Date.now() + 10 * 86400000) } });
    const s = await getSettings();
    await updateSettingsGroup("vip", { ...s.vip, enabled: false }, null);
    expect((await quotePostingFee(seller.id)).amount).toBe(2000);
  });
});
