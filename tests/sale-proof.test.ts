import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { markListingSold, reviewSaleProof, resubmitSaleProof } from "@/lib/services/deals";
import { startConversation } from "@/lib/services/messaging";
import { withdrawListing } from "@/lib/services/cancellations";
import { getSettings, updateSettingsGroup } from "@/lib/settings";
import { makeUser, publishedListing, resetSettings, slip } from "./helpers";

async function setRules() {
  await resetSettings();
  const s = await getSettings();
  await updateSettingsGroup("deals", { ...s.deals, minHoursPublishedBeforeSale: 0, maxCountedDealsPerDay: 50, maxDealsSamePairPer30Days: 50, buyerMinAccountAgeDays: 0 }, null);
}

async function stars(userId: string) {
  return (await prisma.sellerStatistics.findUnique({ where: { userId } }))?.stars ?? 0;
}

describe("proof of sale (sold requests)", () => {
  beforeEach(setRules);

  it("is required by default: no proof, no sold request", async () => {
    expect((await getSettings()).deals.requireSaleProof).toBe(true);
    const seller = await makeUser();
    const l = await publishedListing(seller.id);
    await expect(markListingSold(l.id, seller.id, null)).rejects.toThrow(/proof/i);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("PUBLISHED");
  });

  it("keeps the listing live until an admin accepts, then marks it SOLD and counts the sale", async () => {
    const admin = await makeUser({ admin: true });
    const seller = await makeUser();
    const buyer = await makeUser();
    const l = await publishedListing(seller.id);
    await startConversation(buyer.id, l.id, "Is it available?");

    const deal = await markListingSold(l.id, seller.id, buyer.id, { files: [await slip(), await slip()], note: "Paid by transfer" });
    expect(deal.proofStatus).toBe("PENDING");
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("PUBLISHED");
    const proofs = await prisma.saleProof.findMany({ where: { dealId: deal.id }, include: { file: true } });
    expect(proofs).toHaveLength(2);
    expect(proofs.every((p) => p.file.visibility === "PRIVATE" && p.file.purpose === "sale_proof" && p.file.ownerId === seller.id)).toBe(true);
    expect(await stars(seller.id)).toBe(0);
    expect(await prisma.notification.count({ where: { userId: admin.id, title: { contains: "Proof of sale" } } })).toBeGreaterThan(0);
    // The buyer is not asked anything until the sale is accepted.
    expect(await prisma.notification.count({ where: { userId: buyer.id, type: "deal" } })).toBe(0);
    await expect(markListingSold(l.id, seller.id, buyer.id, { files: [await slip()] })).rejects.toThrow(/already waiting/);

    await reviewSaleProof(deal.id, admin.id, "approve", "");
    const after = await prisma.successfulDeal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(after.proofStatus).toBe("APPROVED");
    expect(after.status).toBe("CONFIRMED");
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect(listing.status).toBe("SOLD");
    expect(listing.soldAt).not.toBeNull();
    expect(await stars(seller.id)).toBe(1);
    expect(await prisma.notification.count({ where: { userId: seller.id, title: { contains: "Sale accepted" } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: buyer.id, title: "Purchase recorded" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: deal.id, action: "deal.proof.approve" } })).toBe(1);
    await expect(reviewSaleProof(deal.id, admin.id, "reject", "late")).rejects.toThrow(/already been reviewed/);
  });

  it("rejecting needs a reason, keeps the listing live and uncounted, and the seller can send new proof", async () => {
    const admin = await makeUser({ admin: true });
    const seller = await makeUser();
    const other = await makeUser();
    const l = await publishedListing(seller.id);
    const deal = await markListingSold(l.id, seller.id, null, { files: [await slip()] });

    await expect(reviewSaleProof(deal.id, admin.id, "reject", "  ")).rejects.toThrow(/why/);
    await reviewSaleProof(deal.id, admin.id, "reject", "Screenshot is unreadable");
    expect((await prisma.successfulDeal.findUniqueOrThrow({ where: { id: deal.id } })).proofStatus).toBe("REJECTED");
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("PUBLISHED");
    expect(await stars(seller.id)).toBe(0);
    expect(await prisma.notification.count({ where: { userId: seller.id, body: { contains: "Screenshot is unreadable" } } })).toBe(1);

    await expect(resubmitSaleProof(deal.id, other.id, { files: [await slip()] })).rejects.toThrow();
    await expect(markListingSold(l.id, seller.id, null, { files: [await slip()] })).rejects.toThrow(/new proof/);
    await resubmitSaleProof(deal.id, seller.id, { files: [await slip()], note: "Clearer copy" });
    const re = await prisma.successfulDeal.findUniqueOrThrow({ where: { id: deal.id }, include: { proofs: true } });
    expect(re.proofStatus).toBe("PENDING");
    expect(re.proofs).toHaveLength(2);
    expect(re.proofReviewNote).toBeNull();

    await reviewSaleProof(deal.id, admin.id, "approve", "Looks good");
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("SOLD");
  });

  it("cannot be accepted once the listing was withdrawn", async () => {
    const admin = await makeUser({ admin: true });
    const seller = await makeUser();
    const l = await publishedListing(seller.id);
    const deal = await markListingSold(l.id, seller.id, null, { files: [await slip()] });
    const s = await getSettings();
    await updateSettingsGroup("cancellation", { ...s.cancellation, enabled: false }, null);
    await withdrawListing(l.id, seller.id, { confirmed: true, expectedFine: 0, reason: "changed my mind" });
    await expect(reviewSaleProof(deal.id, admin.id, "approve", "")).rejects.toThrow(/no longer live/);
  });

  it("with proof switched off, SOLD is immediate (buyer-confirmation flow)", async () => {
    const s = await getSettings();
    await updateSettingsGroup("deals", { ...s.deals, requireSaleProof: false }, null);
    const seller = await makeUser();
    const l = await publishedListing(seller.id);
    const deal = await markListingSold(l.id, seller.id, null);
    expect(deal.proofStatus).toBe("NOT_REQUIRED");
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("SOLD");
  });
});
