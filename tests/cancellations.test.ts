import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { quoteCancellation, withdrawListing, adminResolveCancellation } from "@/lib/services/cancellations";
import { createListingDraft, submitListing, adminRemoveListing } from "@/lib/services/listings";
import { submitPayment, adminVerifyPayment } from "@/lib/services/payments";
import { markListingSold } from "@/lib/services/deals";
import { recomputeSellerStats, adjustStars } from "@/lib/services/reputation";
import { getSettings, updateSettingsGroup } from "@/lib/settings";
import { makeUser, publishedListing, listingInput, resetSettings, slip, today } from "./helpers";

beforeEach(resetSettings);

describe("listing cancellation fine", () => {
  it("shows the fine before withdrawal and requires explicit confirmation of that amount", async () => {
    const seller = await makeUser();
    const l = await publishedListing(seller.id);
    const q = await quoteCancellation(l.id, seller.id);
    expect(q.fine).toBe(1000);
    expect(q.reason).toBe("fine");
    await expect(withdrawListing(l.id, seller.id, { confirmed: false, expectedFine: 1000 })).rejects.toThrow(/confirm/);
    await expect(withdrawListing(l.id, seller.id, { confirmed: true, expectedFine: 500 })).rejects.toThrow(/changed/);
    const rec = await withdrawListing(l.id, seller.id, { confirmed: true, expectedFine: 1000, reason: "Changed my mind" });
    expect(rec.outcome).toBe("FINED");
    expect(rec.fine?.status).toBe("UNPAID");
    expect(rec.fineAmount).toBe(1000);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("WITHDRAWN");
  });

  it("never applies to drafts, unpublished listings, admin-removed or SOLD listings", async () => {
    const seller = await makeUser();
    const admin = await makeUser({ admin: true });
    const draft = await createListingDraft(seller.id, await listingInput(seller.id));
    await expect(quoteCancellation(draft.id, seller.id)).rejects.toThrow(/Only live/);
    await submitListing(draft.id, seller.id);
    await expect(quoteCancellation(draft.id, seller.id)).rejects.toThrow(/Only live/);

    const removed = await publishedListing(seller.id);
    await adminRemoveListing(removed.id, admin.id, "Prohibited item");
    await expect(quoteCancellation(removed.id, seller.id)).rejects.toThrow(/Only live/);

    const sold = await publishedListing(seller.id);
    await markListingSold(sold.id, seller.id, null);
    await expect(quoteCancellation(sold.id, seller.id)).rejects.toThrow(/Only live/);
    expect(await prisma.cancellationRecord.count({ where: { sellerId: seller.id } })).toBe(0);
  });

  it("respects enable/disable, amount and grace period settings", async () => {
    const s = await getSettings();
    const seller = await makeUser();
    await updateSettingsGroup("cancellation", { ...s.cancellation, graceHours: 2 }, null);
    const l1 = await publishedListing(seller.id);
    const q1 = await quoteCancellation(l1.id, seller.id);
    expect(q1).toMatchObject({ fine: 0, reason: "grace" });
    const r1 = await withdrawListing(l1.id, seller.id, { confirmed: true, expectedFine: 0 });
    expect(r1.outcome).toBe("NO_FINE_GRACE");
    expect(r1.countsAgainstSeller).toBe(false);

    await updateSettingsGroup("cancellation", { ...s.cancellation, enabled: false }, null);
    const l2 = await publishedListing(seller.id);
    expect((await quoteCancellation(l2.id, seller.id)).fine).toBe(0);

    await updateSettingsGroup("cancellation", { ...s.cancellation, fineAmount: 2500 }, null);
    const l3 = await publishedListing(seller.id);
    expect((await quoteCancellation(l3.id, seller.id)).fine).toBe(2500);
  });

  it("unpaid fines block new listings; paying the fine via slip unblocks", async () => {
    const seller = await makeUser();
    const admin = await makeUser({ admin: true });
    const l = await publishedListing(seller.id);
    const rec = await withdrawListing(l.id, seller.id, { confirmed: true, expectedFine: 1000 });
    const draft = await createListingDraft(seller.id, await listingInput(seller.id));
    await expect(submitListing(draft.id, seller.id)).rejects.toThrow(/outstanding cancellation fee/);

    const pay = await submitPayment(seller.id, { purpose: "CANCELLATION_FINE", cancellationFineId: rec.fine!.id }, { referenceNumber: "FINE-1", paidAt: today() }, await slip());
    expect((await prisma.cancellationFine.findUniqueOrThrow({ where: { id: rec.fine!.id } })).status).toBe("PAYMENT_SUBMITTED");
    await adminVerifyPayment(pay.paymentId, admin.id, "");
    expect((await prisma.cancellationFine.findUniqueOrThrow({ where: { id: rec.fine!.id } })).status).toBe("PAID");
    await expect(submitListing(draft.id, seller.id)).resolves.toBeTruthy();
  });

  it("reduces Stars when configured and records effects in history", async () => {
    const seller = await makeUser();
    await adjustStars(seller.id, 5, "Starting stars", seller.id);
    const l = await publishedListing(seller.id);
    const rec = await withdrawListing(l.id, seller.id, { confirmed: true, expectedFine: 1000 });
    expect(rec.statsEffect).toMatch(/−1 Star/);
    expect(rec.vipEffect).toMatch(/VIP/);
    const stats = await recomputeSellerStats(seller.id);
    expect(stats.stars).toBe(4);
    expect(stats.voluntaryCancellations).toBe(1);
  });

  it("exception requests and admin overrides remove the penalty entirely", async () => {
    const seller = await makeUser();
    const admin = await makeUser({ admin: true });
    await adjustStars(seller.id, 5, "Starting stars", seller.id);
    const l = await publishedListing(seller.id);
    const rec = await withdrawListing(l.id, seller.id, { confirmed: true, expectedFine: 1000, exceptionRequest: "Item was damaged in a flood" });
    expect(rec.outcome).toBe("EXCEPTION_REQUESTED");
    expect(rec.fine?.status).toBe("PENDING_EXCEPTION");
    // Pending exception does not block posting (only UNPAID does)
    await adminResolveCancellation(rec.id, admin.id, "approve_exception", "Verified flood damage");
    const after = await prisma.cancellationRecord.findUniqueOrThrow({ where: { id: rec.id }, include: { fine: true } });
    expect(after.outcome).toBe("EXCEPTION_APPROVED");
    expect(after.countsAgainstSeller).toBe(false);
    expect(after.fine?.status).toBe("WAIVED");
    expect(after.adminReason).toBe("Verified flood damage");
    expect((await recomputeSellerStats(seller.id)).stars).toBe(5);

    const l2 = await publishedListing(seller.id);
    const rec2 = await withdrawListing(l2.id, seller.id, { confirmed: true, expectedFine: 1000, exceptionRequest: "Please" });
    await adminResolveCancellation(rec2.id, admin.id, "deny_exception", "No evidence provided");
    expect((await prisma.cancellationFine.findUniqueOrThrow({ where: { cancellationId: rec2.id } })).status).toBe("UNPAID");
  });

  it("repeated cancellations trigger warnings, review, VIP suspension and level reduction when enabled", async () => {
    const s = await getSettings();
    await updateSettingsGroup("cancellation", { ...s.cancellation, maxPerPeriod: 1, suspendVipOverLimit: true, reduceLevelOverLimit: true, reduceStars: false, blockPostingWithUnpaidFines: false }, null);
    const seller = await makeUser();
    await prisma.vipStatus.update({ where: { userId: seller.id }, data: { state: "ACTIVE", since: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000) } });
    for (let i = 0; i < 2; i++) {
      const l = await publishedListing(seller.id);
      const q = await quoteCancellation(l.id, seller.id);
      if (i === 1) expect(q.wouldExceedLimit).toBe(true);
      await withdrawListing(l.id, seller.id, { confirmed: true, expectedFine: q.fine });
    }
    const stats = await prisma.sellerStatistics.findUniqueOrThrow({ where: { userId: seller.id } });
    expect(stats.underReview).toBe(true);
    expect(stats.warningIssuedAt).not.toBeNull();
    expect((await prisma.vipStatus.findUniqueOrThrow({ where: { userId: seller.id } })).state).toBe("SUSPENDED");
    expect(await prisma.notification.count({ where: { userId: seller.id, type: "warning" } })).toBe(1);
  });
});
