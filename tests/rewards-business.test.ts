import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { poolAmount, splitPool, createOrUpdatePool, calculatePool, adjustAllocation, approvePool, recordRewardPayment, userRewardHistory, setAllocationWithheld } from "@/lib/services/rewards";
import { createBusiness, requestSubscription, featureListing, businessAnalytics } from "@/lib/services/business";
import { createListingDraft, submitListing } from "@/lib/services/listings";
import { submitPayment, adminVerifyPayment } from "@/lib/services/payments";
import { quotePostingFee } from "@/lib/services/fees";
import { currentMonth, monthRange } from "@/lib/dates";
import { getSettings, updateSettingsGroup } from "@/lib/settings";
import { makeUser, listingInput, resetSettings, slip, today } from "./helpers";

beforeAll(resetSettings);

describe("VIP monthly reward pool", () => {
  it("pool = eligible profit × percentage (MVR 200 × 20% = MVR 40)", () => {
    expect(poolAmount(20000, 20)).toBe(4000);
    expect(poolAmount(0, 20)).toBe(0);
  });

  it("splits exactly, never over-allocating", () => {
    const m = splitPool(4000, [
      { userId: "a", score: 1 },
      { userId: "b", score: 1 },
      { userId: "c", score: 1 },
    ]);
    expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(4000);
    expect([...m.values()].sort()).toEqual([1333, 1333, 1334]);
    expect(splitPool(4000, [{ userId: "a", score: 0 }]).get("a")).toBe(0);
  });

  it("full cycle: create → calculate (weighted by deals) → adjust → approve → pay; users only see their own history", async () => {
    // Isolate from VIP users created by other test files sharing this database.
    await prisma.vipStatus.updateMany({ data: { state: "NONE" } });
    const admin = await makeUser({ admin: true });
    const month = currentMonth();
    const { start } = monthRange(month);
    const vipA = await makeUser({ name: "VIP A" });
    const vipB = await makeUser({ name: "VIP B" });
    const normal = await makeUser({ name: "Normal" });
    const expires = new Date(Date.now() + 90 * 86400000);
    for (const u of [vipA, vipB]) await prisma.vipStatus.update({ where: { userId: u.id }, data: { state: "ACTIVE", since: new Date(start.getTime() - 86400000), expiresAt: expires } });

    // Give VIP A 3 confirmed deals and VIP B 1 deal this month
    const cat = await prisma.category.findFirstOrThrow();
    const island = await prisma.island.findFirstOrThrow({ include: { atoll: true } });
    async function deal(sellerId: string) {
      const l = await prisma.listing.create({ data: { sellerId, title: "x" + Math.random(), description: "desc desc", price: 1000, condition: "GOOD", categoryId: cat.id, atollId: island.atollId, islandId: island.id, status: "SOLD", contentHash: Math.random().toString(), publishedAt: new Date(), soldAt: new Date() } });
      await prisma.successfulDeal.create({ data: { listingId: l.id, sellerId, price: 1000, status: "CONFIRMED", countsTowardStats: true } });
    }
    for (let i = 0; i < 3; i++) await deal(vipA.id);
    await deal(vipB.id);
    await deal(normal.id);

    const s = await getSettings();
    await updateSettingsGroup("rewards", { ...s.rewards, method: "weighted", weights: { deals: 1, listings: 0, referrals: 0, stars: 0 } }, null);

    const pool = await createOrUpdatePool({ month, eligibleProfit: 20000, rewardPercent: 20, profitNote: "Revenue minus costs" }, admin.id);
    expect(pool.poolAmount).toBe(4000);
    const count = await calculatePool(pool.id, admin.id);
    expect(count).toBe(2);
    const allocs = await prisma.vipRewardAllocation.findMany({ where: { poolId: pool.id } });
    const a = allocs.find((x) => x.userId === vipA.id)!;
    const b = allocs.find((x) => x.userId === vipB.id)!;
    expect(a.calculatedAmount).toBe(3000);
    expect(b.calculatedAmount).toBe(1000);
    expect(allocs.find((x) => x.userId === normal.id)).toBeUndefined();

    await expect(adjustAllocation(a.id, admin.id, 500, "")).rejects.toThrow(/reason/);
    await adjustAllocation(a.id, admin.id, 500, "Bonus");
    await expect(approvePool(pool.id, admin.id)).rejects.toThrow(/exceed/);
    await adjustAllocation(a.id, admin.id, -200, "Correction");
    await approvePool(pool.id, admin.id);
    expect((await prisma.vipRewardPool.findUniqueOrThrow({ where: { id: pool.id } })).status).toBe("APPROVED");
    await expect(createOrUpdatePool({ month, eligibleProfit: 1, rewardPercent: 1 }, admin.id)).rejects.toThrow(/approved/);

    await recordRewardPayment(a.id, admin.id, { method: "Bank transfer", reference: "TX1", paidAt: new Date() });
    await setAllocationWithheld(b.id, admin.id, true, "Pending ID check");
    const histA = await userRewardHistory(vipA.id);
    expect(histA).toHaveLength(1);
    expect(histA[0].finalAmount).toBe(2800);
    expect(histA[0].status).toBe("PAID");
    expect(histA.every((h) => h.userId === vipA.id)).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: "rewards." } } })).toBeGreaterThanOrEqual(6);
  });
});

describe("business accounts & subscriptions", () => {
  it("business is optional; subscription activates after verified payment and grants fee-free listings", async () => {
    const owner = await makeUser();
    const admin = await makeUser({ admin: true });
    // Individual sellers are never forced into a business account
    expect((await quotePostingFee(owner.id)).amount).toBe(2000);

    const biz = await createBusiness(owner.id, { name: "Island Electronics", description: "Phones and laptops", phone: "3301234" });
    expect(biz.slug).toBe("island-electronics");
    const plan = await prisma.subscriptionPlan.findFirstOrThrow({ where: { name: "Business Starter" } });
    await prisma.subscriptionPlan.update({ where: { id: plan.id }, data: { freeListingsPerPeriod: 1 } });
    const sub = await requestSubscription(biz.id, owner.id, plan.id);
    expect(sub.status).toBe("PENDING_PAYMENT");
    const pay = await submitPayment(owner.id, { purpose: "BUSINESS_SUBSCRIPTION", subscriptionId: sub.id }, { referenceNumber: "SUB-1", paidAt: today() }, await slip());
    await adminVerifyPayment(pay.paymentId, admin.id, "");
    const active = await prisma.businessSubscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(active.status).toBe("ACTIVE");
    expect(active.endsAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);

    expect((await quotePostingFee(owner.id, { businessId: biz.id })).amount).toBe(0);
    const l1 = await createListingDraft(owner.id, await listingInput(owner.id, { businessId: biz.id }));
    const r1 = await submitListing(l1.id, owner.id);
    expect(r1.published).toBe(true);
    // quota of 1 used → next listing pays normal fee
    expect((await quotePostingFee(owner.id, { businessId: biz.id })).amount).toBe(2000);

    await featureListing(biz.id, owner.id, l1.id, 7);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l1.id } })).featuredUntil).not.toBeNull();
    const stats = await businessAnalytics(biz.id);
    expect(stats.totals.live).toBe(1);
  });

  it("other users cannot use someone else's business", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const biz = await createBusiness(owner.id, { name: "Hulhumale Furniture" });
    await expect(createListingDraft(other.id, await listingInput(other.id, { businessId: biz.id }))).rejects.toThrow(/business/);
    const plan = await prisma.subscriptionPlan.findFirstOrThrow();
    await expect(requestSubscription(biz.id, other.id, plan.id)).rejects.toThrow();
  });
});
