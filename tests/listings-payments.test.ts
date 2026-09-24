import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createListingDraft, submitListing, searchListings, deleteDraft, updatePublishedListing, updateListingDraft } from "@/lib/services/listings";
import { submitPayment, adminVerifyPayment, adminRejectPayment, adminRefundPayment, cancelOwnPayment } from "@/lib/services/payments";
import { quotePostingFee } from "@/lib/services/fees";
import { setSlipExtractorForTests } from "@/lib/services/ai-screening";
import { updateSettingsGroup, getSettings } from "@/lib/settings";
import { makeUser, listingInput, noisyImage, resetSettings, refData, publishedListing, slip, today } from "./helpers";

beforeAll(resetSettings);
afterEach(() => setSlipExtractorForTests(null));

describe("listing creation", () => {
  it("requires a verified email to sell", async () => {
    const u = await makeUser({ verified: false });
    await expect(createListingDraft(u.id, await listingInput(u.id))).rejects.toThrow(/verify your email/);
  });

  it("validates category/subcategory/atoll/island consistency", async () => {
    const u = await makeUser();
    const other = await prisma.island.findFirstOrThrow({ where: { atoll: { code: "S" } } });
    await expect(createListingDraft(u.id, await listingInput(u.id, { islandId: other.id }))).rejects.toThrow(/island/);
    const otherSub = await prisma.subcategory.findFirstOrThrow({ where: { category: { slug: "vehicles" } } });
    await expect(createListingDraft(u.id, await listingInput(u.id, { subcategoryId: otherSub.id }))).rejects.toThrow(/subcategory/);
  });

  it("rejects images the user did not upload", async () => {
    const u = await makeUser();
    const v = await makeUser();
    const input = await listingInput(v.id);
    await expect(createListingDraft(u.id, input)).rejects.toThrow(/photos/);
  });

  it("prevents duplicate listings by the same seller", async () => {
    const u = await makeUser();
    const input = await listingInput(u.id, { title: "Honda Dio 2019 for sale" });
    await createListingDraft(u.id, input);
    await expect(createListingDraft(u.id, { ...(await listingInput(u.id)), title: "honda dio 2019 FOR SALE" })).rejects.toThrow(/already have an active listing/);
  });

  it("drafts can be edited and deleted freely (no cancellation fee)", async () => {
    const u = await makeUser();
    const l = await createListingDraft(u.id, await listingInput(u.id));
    await updateListingDraft(l.id, u.id, await listingInput(u.id, { title: "Updated title here" }));
    await deleteDraft(l.id, u.id);
    expect(await prisma.listing.findUnique({ where: { id: l.id } })).toBeNull();
    expect(await prisma.cancellationRecord.count({ where: { sellerId: u.id } })).toBe(0);
  });
});

describe("posting fee", () => {
  it("normal sellers pay the admin-configured fee (default MVR 20), VIP sellers MVR 10", async () => {
    const u = await makeUser();
    const q = await quotePostingFee(u.id);
    expect(q).toMatchObject({ amount: 2000, isVipRate: false, normalFee: 2000, vipFee: 1000, discountPercent: 50 });
    await prisma.vipStatus.update({ where: { userId: u.id }, data: { state: "ACTIVE", since: new Date(), expiresAt: new Date(Date.now() + 86400000) } });
    expect((await quotePostingFee(u.id)).amount).toBe(1000);
    expect((await quotePostingFee(u.id)).isVipRate).toBe(true);
    // expired VIP pays normal fee
    await prisma.vipStatus.update({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await quotePostingFee(u.id)).amount).toBe(2000);
  });

  it("fee is not hard-coded: admin changes apply immediately", async () => {
    const u = await makeUser();
    const s = await getSettings();
    await updateSettingsGroup("fees", { ...s.fees, postingFee: 2500, vipPostingFee: 1250 }, null);
    expect((await quotePostingFee(u.id)).amount).toBe(2500);
    await updateSettingsGroup("fees", { ...s.fees, postingFee: 2000, vipPostingFee: 1000 }, null);
  });
});

describe("payment submission and verification", () => {
  it("full flow: draft → pending payment → slip → PENDING → admin verify → PUBLISHED", async () => {
    const seller = await makeUser();
    const admin = await makeUser({ admin: true });
    const l = await createListingDraft(seller.id, await listingInput(seller.id));
    const sub = await submitListing(l.id, seller.id);
    expect(sub.published).toBe(false);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("PENDING_PAYMENT");

    const res = await submitPayment(seller.id, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: "BML-778899", paidAt: today(), amountPaid: "20" }, await slip());
    expect(res.status).toBe("PENDING"); // AI unavailable in tests → human review, no flags
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: res.paymentId }, include: { slips: { include: { file: true } }, aiVerifications: true } });
    expect(p.amount).toBe(2000);
    expect(p.slips[0].file.visibility).toBe("PRIVATE");
    expect(p.aiVerifications[0].status).toBe("UNAVAILABLE");
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("PAYMENT_REVIEW");

    // Not visible in search yet
    expect((await searchListings({ q: l.title })).items.map((i) => i.id)).not.toContain(l.id);

    await adminVerifyPayment(res.paymentId, admin.id, "");
    const pub = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect(pub.status).toBe("PUBLISHED");
    expect(pub.publishedAt).not.toBeNull();
    expect(pub.feeAmount).toBe(2000);
    expect(await prisma.notification.count({ where: { userId: seller.id, type: "listing" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: res.paymentId, action: "payment.verify" } })).toBe(1);
    expect((await searchListings({ q: l.title })).total).toBe(1);
  });

  it("VIP sellers are charged MVR 10 on the payment record", async () => {
    const seller = await makeUser();
    await prisma.vipStatus.update({ where: { userId: seller.id }, data: { state: "ACTIVE", since: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000) } });
    const l = await createListingDraft(seller.id, await listingInput(seller.id));
    await submitListing(l.id, seller.id);
    const res = await submitPayment(seller.id, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: "VIP-1000", paidAt: today() }, await slip());
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: res.paymentId } });
    expect(p.amount).toBe(1000);
    expect(p.isVipRate).toBe(true);
  });

  it("duplicate slips and re-used references are flagged for human review (not auto-rejected)", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const s = await slip();
    const la = await createListingDraft(a.id, await listingInput(a.id));
    await submitListing(la.id, a.id);
    await submitPayment(a.id, { purpose: "LISTING_FEE", listingId: la.id }, { referenceNumber: "DUPREF-1", paidAt: today() }, s);

    const lb = await createListingDraft(b.id, await listingInput(b.id));
    await submitListing(lb.id, b.id);
    const res = await submitPayment(b.id, { purpose: "LISTING_FEE", listingId: lb.id }, { referenceNumber: "dupref 1", paidAt: today() }, s);
    expect(res.status).toBe("NEEDS_REVIEW");
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: res.paymentId } });
    expect(p.flags).toEqual(expect.arrayContaining(["DUPLICATE_SLIP", "DUPLICATE_REFERENCE"]));
    // User-facing listing status is neutral
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: lb.id } })).status).toBe("PAYMENT_REVIEW");
  });

  it("flags re-encoded copies of the same slip (perceptual hash)", async () => {
    const sharp = (await import("sharp")).default;
    const a = await makeUser();
    const b = await makeUser();
    const original = await noisyImage(9999);
    const copy = await sharp(original).resize(280, 280).jpeg({ quality: 70 }).toBuffer();
    const la = await createListingDraft(a.id, await listingInput(a.id));
    await submitListing(la.id, a.id);
    await submitPayment(a.id, { purpose: "LISTING_FEE", listingId: la.id }, { referenceNumber: "PH-ORIG", paidAt: today() }, { buffer: original, mimeType: "image/png" });
    const lb = await createListingDraft(b.id, await listingInput(b.id));
    await submitListing(lb.id, b.id);
    const res = await submitPayment(b.id, { purpose: "LISTING_FEE", listingId: lb.id }, { referenceNumber: "PH-COPY", paidAt: today() }, { buffer: copy, mimeType: "image/jpeg" });
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: res.paymentId } });
    expect(p.flags).toContain("SIMILAR_SLIP");
  });

  it("flags old / future payment dates and a mismatched entered amount", async () => {
    const u = await makeUser();
    const l = await createListingDraft(u.id, await listingInput(u.id));
    await submitListing(l.id, u.id);
    const res = await submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: "OLD-1", paidAt: "2020-01-01", amountPaid: "15" }, await slip());
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: res.paymentId } });
    expect(p.status).toBe("NEEDS_REVIEW");
    expect(p.flags).toEqual(expect.arrayContaining(["DATE_OUT_OF_RANGE", "AMOUNT_ENTERED_MISMATCH"]));
  });

  it("AI extraction: mismatching amount is flagged; matching slip passes; auto-approve only when enabled", async () => {
    const settings = await getSettings();
    const u = await makeUser();
    setSlipExtractorForTests(async () => ({
      ok: true,
      model: "test-model",
      data: { is_payment_receipt: true, amount: 10, currency: "MVR", reference_number: "AI-1", transaction_date: today(), recipient_account: settings.payment.accountNumber, recipient_name: "OceanX", payer_name: "Test", bank_name: "BML", confidence: 0.97, notes: "" },
    }));
    const l = await createListingDraft(u.id, await listingInput(u.id));
    await submitListing(l.id, u.id);
    const r1 = await submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: "AI-1", paidAt: today() }, await slip());
    expect(r1.status).toBe("NEEDS_REVIEW");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: r1.paymentId } })).flags).toContain("AMOUNT_MISMATCH");

    // Correct amount, auto-approve disabled → PENDING (human confirms)
    setSlipExtractorForTests(async () => ({
      ok: true,
      model: "test-model",
      data: { is_payment_receipt: true, amount: 20, currency: "MVR", reference_number: "AI-2", transaction_date: today(), recipient_account: "*******" + settings.payment.accountNumber.slice(-4), recipient_name: "OceanX", payer_name: "Test", bank_name: "BML", confidence: 0.97, notes: "" },
    }));
    const l2 = await createListingDraft(u.id, await listingInput(u.id));
    await submitListing(l2.id, u.id);
    const r2 = await submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l2.id }, { referenceNumber: "AI-2", paidAt: today() }, await slip());
    expect(r2.status).toBe("PENDING");
    const ai = await prisma.aiVerification.findFirstOrThrow({ where: { paymentId: r2.paymentId } });
    expect(ai.status).toBe("PASSED");
    expect(ai.extractedAmount).toBe(2000);

    // Auto-approve enabled → VERIFIED & published
    await updateSettingsGroup("payment", { ...settings.payment, aiAutoApprove: true }, null);
    setSlipExtractorForTests(async () => ({
      ok: true,
      model: "test-model",
      data: { is_payment_receipt: true, amount: 20, currency: "MVR", reference_number: "AI-3", transaction_date: today(), recipient_account: settings.payment.accountNumber, recipient_name: "OceanX", payer_name: "Test", bank_name: "BML", confidence: 0.97, notes: "" },
    }));
    const l3 = await createListingDraft(u.id, await listingInput(u.id));
    await submitListing(l3.id, u.id);
    const r3 = await submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l3.id }, { referenceNumber: "AI-3", paidAt: today() }, await slip());
    expect(r3.status).toBe("VERIFIED");
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l3.id } })).status).toBe("PUBLISHED");

    // Low confidence is never auto-approved
    setSlipExtractorForTests(async () => ({
      ok: true,
      model: "test-model",
      data: { is_payment_receipt: true, amount: 20, currency: "MVR", reference_number: "AI-4", transaction_date: today(), recipient_account: settings.payment.accountNumber, recipient_name: null, payer_name: null, bank_name: null, confidence: 0.4, notes: "blurry" },
    }));
    const l4 = await createListingDraft(u.id, await listingInput(u.id));
    await submitListing(l4.id, u.id);
    const r4 = await submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l4.id }, { referenceNumber: "AI-4", paidAt: today() }, await slip());
    expect(r4.status).toBe("NEEDS_REVIEW");
    await updateSettingsGroup("payment", { ...settings.payment, aiAutoApprove: false }, null);
  });

  it("rejection returns the listing to the seller who can upload a new slip", async () => {
    const u = await makeUser();
    const admin = await makeUser({ admin: true });
    const l = await createListingDraft(u.id, await listingInput(u.id));
    await submitListing(l.id, u.id);
    const s = await slip();
    const r1 = await submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: "REJ-1", paidAt: today() }, s);
    await expect(adminRejectPayment(r1.paymentId, admin.id, "")).rejects.toThrow(/reason/);
    await adminRejectPayment(r1.paymentId, admin.id, "Slip is unreadable");
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("REJECTED");
    // re-upload of the same slip by the same user after rejection is not treated as duplicate
    const r2 = await submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: "REJ-1", paidAt: today() }, s);
    expect(r2.status).toBe("PENDING");
    await adminVerifyPayment(r2.paymentId, admin.id, "");
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("PUBLISHED");
  });

  it("cannot submit two open payments for the same listing; user can cancel a pending payment", async () => {
    const u = await makeUser();
    const l = await createListingDraft(u.id, await listingInput(u.id));
    await submitListing(l.id, u.id);
    const r = await submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: "ONE-1", paidAt: today() }, await slip());
    await expect(submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: "ONE-2", paidAt: today() }, await slip())).rejects.toThrow();
    await cancelOwnPayment(r.paymentId, u.id);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("PENDING_PAYMENT");
  });

  it("flagged payments require an admin note to verify; refunds only for verified payments", async () => {
    const u = await makeUser();
    const admin = await makeUser({ admin: true });
    const l = await createListingDraft(u.id, await listingInput(u.id));
    await submitListing(l.id, u.id);
    const r = await submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: "FLG-1", paidAt: "2019-05-05" }, await slip());
    await expect(adminVerifyPayment(r.paymentId, admin.id, "")).rejects.toThrow(/note/);
    await expect(adminRefundPayment(r.paymentId, admin.id, "x")).rejects.toThrow(/verified/);
    await adminVerifyPayment(r.paymentId, admin.id, "Called bank, confirmed transfer");
    await adminRefundPayment(r.paymentId, admin.id, "Goodwill refund");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: r.paymentId } })).status).toBe("REFUNDED");
  });

  it("rejects PDFs that are not PDFs and non-image files", async () => {
    const u = await makeUser();
    const l = await createListingDraft(u.id, await listingInput(u.id));
    await submitListing(l.id, u.id);
    await expect(submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: "PDF-1", paidAt: today() }, { buffer: Buffer.from("not a pdf"), mimeType: "application/pdf" })).rejects.toThrow(/invalid/);
    await expect(submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: "TXT-1", paidAt: today() }, { buffer: Buffer.from("<script>alert(1)</script>"), mimeType: "image/png" })).rejects.toThrow(/not a supported image/);
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
    const ok = await submitPayment(u.id, { purpose: "LISTING_FEE", listingId: l.id }, { referenceNumber: "PDF-OK", paidAt: today() }, { buffer: pdf, mimeType: "application/pdf" });
    expect(ok.status).toBe("PENDING");
  });

  it("published listings can edit details but not title/category", async () => {
    const u = await makeUser();
    const l = await publishedListing(u.id);
    const updated = await updatePublishedListing(l.id, u.id, { description: "New description for this item", price: "7000", negotiable: false, showPhone: false });
    expect(updated.price).toBe(700000);
    expect(updated.title).toBe(l.title);
  });
});

describe("search", () => {
  it("filters by keyword, category, location, price and condition, and sorts", async () => {
    const u = await makeUser();
    const r = await refData();
    const cheap = await publishedListing(u.id, { title: "Samsung Galaxy A54 blue", price: "3000", condition: "GOOD" });
    const pricey = await publishedListing(u.id, { title: "Samsung Galaxy S24 Ultra", price: "18000", condition: "NEW" });
    const res = await searchListings({ q: "samsung galaxy", category: r.category.slug, sort: "price_asc" });
    const ids = res.items.map((i) => i.id);
    expect(ids.indexOf(cheap.id)).toBeLessThan(ids.indexOf(pricey.id));
    expect((await searchListings({ q: "samsung", max: "5000" })).items.map((i) => i.id)).toContain(cheap.id);
    expect((await searchListings({ q: "samsung", max: "5000" })).items.map((i) => i.id)).not.toContain(pricey.id);
    expect((await searchListings({ q: "samsung", condition: "NEW" })).items.map((i) => i.id)).toEqual([pricey.id]);
    expect((await searchListings({ q: "samsung", island: r.island.id })).total).toBeGreaterThanOrEqual(2);
    const other = await prisma.island.findFirstOrThrow({ where: { atoll: { code: "S" } } });
    expect((await searchListings({ q: "samsung", island: other.id })).total).toBe(0);
    // suspended sellers' listings are hidden
    await prisma.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    expect((await searchListings({ q: "samsung galaxy s24" })).total).toBe(0);
    await prisma.user.update({ where: { id: u.id }, data: { status: "ACTIVE" } });
    // garbage params do not crash
    expect((await searchListings({ sort: "drop table", page: "-5", min: "abc" })).params.sort).toBe("newest");
  });
});

