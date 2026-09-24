import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createListingDraft, submitListing } from "@/lib/services/listings";
import { submitPayment } from "@/lib/services/payments";
import { quotePostingFee } from "@/lib/services/fees";
import { quoteCancellation, withdrawListing } from "@/lib/services/cancellations";
import { setSlipExtractorForTests } from "@/lib/services/ai-screening";
import { getSettings } from "@/lib/settings";
import { makeUser, listingInput, resetSettings, slip, today, publishedListing } from "./helpers";

beforeAll(resetSettings);
afterEach(() => setSlipExtractorForTests(null));

describe("slip-only payments", () => {
  it("accepts a payment with just the slip", async () => {
    const u = await makeUser();
    const l = await createListingDraft(u.id, await listingInput(u.id));
    await submitListing(l.id, u.id);
    const r = await submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l.id }, {}, await slip());
    expect(r.status).toBe("PENDING");
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: r.paymentId } });
    expect(p.referenceNumber).toBeNull();
    expect(p.paidAt).toBeNull();
  });

  it("fills reference/date from the slip via AI and still catches a re-used reference", async () => {
    const settings = await getSettings();
    const read = (ref: string) => async () => ({
      ok: true as const,
      model: "test",
      data: { is_payment_receipt: true, amount: 20, currency: "MVR", reference_number: ref, transaction_date: today(), recipient_account: settings.payment.accountNumber, recipient_name: null, payer_name: null, bank_name: null, confidence: 0.99, notes: "" },
    });
    const a = await makeUser();
    const b = await makeUser();
    setSlipExtractorForTests(read("BLAZ-SAME-1"));
    const la = await createListingDraft(a.id, await listingInput(a.id));
    await submitListing(la.id, a.id);
    const ra = await submitPayment(a.id, { purpose: "LISTING_FEE", listingId: la.id }, {}, await slip());
    const pa = await prisma.payment.findUniqueOrThrow({ where: { id: ra.paymentId } });
    expect(pa.referenceNumber).toBe("BLAZ-SAME-1");
    expect(pa.paidAt).not.toBeNull();
    expect(ra.status).toBe("PENDING");

    const lb = await createListingDraft(b.id, await listingInput(b.id));
    await submitListing(lb.id, b.id);
    const rb = await submitPayment(b.id, { purpose: "LISTING_FEE", listingId: lb.id }, {}, await slip());
    expect(rb.status).toBe("NEEDS_REVIEW");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: rb.paymentId } })).flags).toContain("DUPLICATE_REFERENCE");
  });
});

describe("optional location", () => {
  it("listings can be created without atoll/island, and invalid combos are still rejected", async () => {
    const u = await makeUser();
    const l = await createListingDraft(u.id, await listingInput(u.id, { atollId: "", islandId: "", locationId: "" }));
    expect(l.atollId).toBeNull();
    expect(l.islandId).toBeNull();
    // island alone fills in its atoll
    const island = await prisma.island.findFirstOrThrow({ where: { atoll: { code: "S" } } });
    const l2 = await createListingDraft(u.id, await listingInput(u.id, { atollId: "", islandId: island.id, locationId: "" }));
    expect(l2.atollId).toBe(island.atollId);
    const other = await prisma.atoll.findFirstOrThrow({ where: { code: "HA" } });
    await expect(createListingDraft(u.id, await listingInput(u.id, { atollId: other.id, islandId: island.id, locationId: "" }))).rejects.toThrow(/island/);
  });
});

describe("admins", () => {
  it("post for free (published immediately) and pay no cancellation fine", async () => {
    const admin = await makeUser({ admin: true });
    expect((await quotePostingFee(admin.id)).amount).toBe(0);
    const l = await createListingDraft(admin.id, await listingInput(admin.id));
    const r = await submitListing(l.id, admin.id);
    expect(r.published).toBe(true);
    const q = await quoteCancellation(l.id, admin.id);
    expect(q).toMatchObject({ fine: 0, reason: "admin" });
    const rec = await withdrawListing(l.id, admin.id, { confirmed: true, expectedFine: 0 });
    expect(rec.fine).toBeNull();
    expect(rec.countsAgainstSeller).toBe(false);
  });

  it("normal users still pay", async () => {
    const u = await makeUser();
    expect((await quotePostingFee(u.id)).amount).toBe(2000);
    const l = await publishedListing(u.id);
    expect((await quoteCancellation(l.id, u.id)).fine).toBe(1000);
  });
});
