import type { PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { sha256 } from "../crypto";
import { getSettings, type Settings } from "../settings";
import { UserError, NotFoundError, ForbiddenError } from "../errors";
import { perceptualHash, processImage, isPdf, hammingDistanceHex, MAX_UPLOAD_BYTES } from "../images";
import { saveFile, readFileBytes } from "../storage";
import { formatMVR, mvrToLaari } from "../money";
import { daysAgo, addDays } from "../dates";
import { notify } from "../notify";
import { audit } from "../audit";
import { enforceRateLimit } from "../rate-limit";
import { cleanText } from "../validation";
import { quotePostingFee } from "./fees";
import { publishListing } from "./listings";
import { recomputeSellerStats } from "./reputation";
import { runSlipExtraction, aiConfigured } from "./ai-screening";

export const OPEN_PAYMENT_STATUSES: PaymentStatus[] = ["AI_CHECKING", "PENDING", "NEEDS_REVIEW"];
const LIVE_PAYMENT_STATUSES: PaymentStatus[] = [...OPEN_PAYMENT_STATUSES, "VERIFIED"];

export const FLAG_LABELS: Record<string, string> = {
  DUPLICATE_SLIP: "This exact slip file was uploaded for another payment",
  SIMILAR_SLIP: "Slip looks very similar to another uploaded slip",
  DUPLICATE_REFERENCE: "Reference number already used on another payment",
  DATE_OUT_OF_RANGE: "Payment date is in the future or older than allowed",
  AMOUNT_MISMATCH: "Amount read from slip differs from the expected amount",
  REFERENCE_MISMATCH: "Reference read from slip differs from the one entered",
  RECIPIENT_MISMATCH: "Recipient account on slip does not match OceanX account",
  LOW_CONFIDENCE: "AI could not read the slip confidently",
  NOT_A_RECEIPT: "AI could not identify this as a payment receipt",
  CURRENCY_MISMATCH: "Currency on slip is not MVR",
  AMOUNT_ENTERED_MISMATCH: "Amount entered by the user differs from the expected amount",
};

export function normalizeReference(ref: string) {
  return ref.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Only the slip is required from customers; reference and date are read from the slip when AI is enabled. */
export const slipDetailsSchema = z.object({
  referenceNumber: z.string().trim().max(64).optional().default(""),
  paidAt: z
    .string()
    .trim()
    .optional()
    .default("")
    .transform((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(`${v}T12:00:00+05:00`) : null)),
  amountPaid: z.string().trim().optional().default(""),
  payerName: z.string().trim().max(100).optional().default(""),
  payerAccount: z.string().trim().max(40).optional().default(""),
  bankName: z.string().trim().max(60).optional().default(""),
  note: z.string().max(500).optional().default(""),
});

type Target = { purpose: PaymentPurpose; listingId?: string; cancellationFineId?: string; subscriptionId?: string };

/** Determines the amount OceanX expects for a payment target, after checking ownership and state. */
export async function expectedAmountFor(userId: string, t: Target, settings: Settings) {
  if (t.purpose === "LISTING_FEE") {
    const listing = await prisma.listing.findUnique({ where: { id: t.listingId! } });
    if (!listing) throw new NotFoundError("Listing not found.");
    if (listing.sellerId !== userId) throw new ForbiddenError();
    if (!["PENDING_PAYMENT", "REJECTED"].includes(listing.status)) throw new UserError("This listing is not awaiting payment.");
    const quote = await quotePostingFee(userId, { businessId: listing.businessId, settings, excludeListingId: listing.id });
    if (quote.amount === 0) throw new UserError("No posting fee is due for this listing.");
    return { amount: quote.amount, isVipRate: quote.isVipRate, label: `Posting fee for "${listing.title}"` };
  }
  if (t.purpose === "CANCELLATION_FINE") {
    const fine = await prisma.cancellationFine.findUnique({ where: { id: t.cancellationFineId! }, include: { cancellation: { include: { listing: true } } } });
    if (!fine) throw new NotFoundError("Fine not found.");
    if (fine.cancellation.sellerId !== userId) throw new ForbiddenError();
    if (fine.status !== "UNPAID") throw new UserError("This fee is not awaiting payment.");
    return { amount: fine.amount, isVipRate: false, label: `Cancellation fee for "${fine.cancellation.listing.title}"` };
  }
  const sub = await prisma.businessSubscription.findUnique({ where: { id: t.subscriptionId! }, include: { business: true, plan: true } });
  if (!sub) throw new NotFoundError("Subscription not found.");
  if (sub.business.ownerId !== userId) throw new ForbiddenError();
  if (sub.status !== "PENDING_PAYMENT") throw new UserError("This subscription is not awaiting payment.");
  return { amount: sub.price, isVipRate: false, label: `${sub.plan.name} plan for ${sub.business.name}` };
}

/** Validates and normalises an uploaded document (image or PDF). Also used for proof-of-sale files. */
export async function processSlipFile(buf: Buffer, declaredType: string, what = "payment slip") {
  if (buf.length === 0) throw new UserError(`Please attach your ${what}.`);
  if (buf.length > MAX_UPLOAD_BYTES) throw new UserError(`${what.charAt(0).toUpperCase() + what.slice(1)} file is too large (max 4 MB).`);
  const originalHash = sha256(buf);
  if (isPdf(buf) || declaredType === "application/pdf") {
    if (!isPdf(buf)) throw new UserError("This PDF file appears to be invalid.");
    return { buffer: buf, mimeType: "application/pdf", originalHash, phash: null as string | null, width: undefined, height: undefined };
  }
  const img = await processImage(buf, { maxSize: 2400, quality: 88 });
  return { ...img, originalHash, phash: await perceptualHash(buf) };
}

export async function submitPayment(
  userId: string,
  target: Target,
  details: z.input<typeof slipDetailsSchema>,
  slip: { buffer: Buffer; mimeType: string },
) {
  await enforceRateLimit(`payment:${userId}`, 15, 3600, "Too many payment submissions. Please try again later.");
  const settings = await getSettings();
  const d = slipDetailsSchema.parse(details);
  const expected = await expectedAmountFor(userId, target, settings);

  const open = await prisma.payment.findFirst({
    where: {
      status: { in: LIVE_PAYMENT_STATUSES },
      ...(target.listingId ? { listingId: target.listingId, purpose: "LISTING_FEE" } : {}),
      ...(target.cancellationFineId ? { cancellationFineId: target.cancellationFineId } : {}),
      ...(target.subscriptionId ? { subscriptionId: target.subscriptionId } : {}),
    },
  });
  if (open) throw new UserError("A payment for this item is already being reviewed.");

  const file = await processSlipFile(slip.buffer, slip.mimeType);
  const stored = await saveFile({ buffer: file.buffer, mimeType: file.mimeType, visibility: "PRIVATE", purpose: "payment_slip", ownerId: userId, width: file.width, height: file.height, sha: file.originalHash });

  const flags: string[] = [];
  if (d.amountPaid) {
    const n = Number(d.amountPaid.replace(/[, ]/g, ""));
    if (Number.isFinite(n) && mvrToLaari(n) !== expected.amount) flags.push("AMOUNT_ENTERED_MISMATCH");
  }

  // Previous payments on the same target in REJECTED / CANCELLED state are cleared so a new payment can be linked (unique FK).
  if (target.cancellationFineId) await prisma.payment.updateMany({ where: { cancellationFineId: target.cancellationFineId, status: { in: ["REJECTED", "CANCELLED"] } }, data: { cancellationFineId: null } });
  if (target.subscriptionId) await prisma.payment.updateMany({ where: { subscriptionId: target.subscriptionId, status: { in: ["REJECTED", "CANCELLED"] } }, data: { subscriptionId: null } });

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        userId,
        purpose: target.purpose,
        status: "AI_CHECKING",
        amount: expected.amount,
        isVipRate: expected.isVipRate,
        listingId: target.listingId ?? null,
        cancellationFineId: target.cancellationFineId ?? null,
        subscriptionId: target.subscriptionId ?? null,
        referenceNumber: d.referenceNumber ? cleanText(d.referenceNumber, 64) : null,
        referenceNormalized: d.referenceNumber ? normalizeReference(d.referenceNumber) || null : null,
        paidAt: d.paidAt,
        payerName: d.payerName || null,
        payerAccount: d.payerAccount || null,
        bankName: d.bankName || null,
        userNote: d.note ? cleanText(d.note, 500) : null,
        flags,
        slips: { create: { fileId: stored.id, sha256: file.originalHash, perceptualHash: file.phash } },
      },
    });
    if (target.listingId) await tx.listing.update({ where: { id: target.listingId }, data: { status: "PAYMENT_REVIEW", feeAmount: expected.amount, feeIsVipRate: expected.isVipRate, feeWaivedReason: null } });
    if (target.cancellationFineId) await tx.cancellationFine.update({ where: { id: target.cancellationFineId }, data: { status: "PAYMENT_SUBMITTED" } });
    return p;
  });

  const status = await screenPayment(payment.id, { buffer: file.buffer, mimeType: file.mimeType });
  return { paymentId: payment.id, status };
}

/**
 * Screening = deterministic duplicate / consistency rules + optional AI extraction.
 * Outcome: VERIFIED only when auto-approve is enabled and everything is clean with high confidence;
 * NEEDS_REVIEW when anything is flagged; otherwise PENDING for a human to confirm.
 */
export async function screenPayment(paymentId: string, fileIn?: { buffer: Buffer; mimeType: string }): Promise<PaymentStatus> {
  const settings = await getSettings();
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { slips: { orderBy: { createdAt: "desc" }, take: 1, include: { file: true } } } });
  const slip = payment.slips[0];
  const flags = new Set<string>(payment.flags.filter((f) => f === "AMOUNT_ENTERED_MISMATCH"));
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // 1. Exact duplicate slip
  if (slip) {
    // A customer re-uploading the same slip after their own rejected/cancelled attempt is not a duplicate.
    const notOwnRetry = { NOT: { userId: payment.userId, status: { in: ["REJECTED", "CANCELLED"] as PaymentStatus[] } } };
    const dup = await prisma.paymentSlip.findFirst({ where: { sha256: slip.sha256, paymentId: { not: paymentId }, payment: notOwnRetry }, select: { paymentId: true } });
    checks.duplicateSlip = { ok: !dup, detail: dup ? `Same file as payment ${dup.paymentId}` : "No identical slip found" };
    if (dup) flags.add("DUPLICATE_SLIP");
    // 2. Visually similar slip (re-encoded / resized copy)
    if (slip.perceptualHash && !dup) {
      const recent = await prisma.paymentSlip.findMany({
        where: { perceptualHash: { not: null }, paymentId: { not: paymentId }, createdAt: { gte: daysAgo(180) }, payment: notOwnRetry },
        select: { perceptualHash: true, paymentId: true },
        take: 5000,
        orderBy: { createdAt: "desc" },
      });
      const similar = recent.find((r) => hammingDistanceHex(r.perceptualHash!, slip.perceptualHash!) <= 3);
      checks.similarSlip = { ok: !similar, detail: similar ? `Visually similar to payment ${similar.paymentId}` : "No similar slip found" };
      if (similar) flags.add("SIMILAR_SLIP");
    }
  }
  // 3. Duplicate transaction reference
  if (payment.referenceNormalized) {
    const dupRef = await prisma.payment.findFirst({
      where: {
        referenceNormalized: payment.referenceNormalized,
        id: { not: paymentId },
        status: { notIn: ["CANCELLED"] },
        NOT: { userId: payment.userId, status: "REJECTED" },
      },
      select: { id: true },
    });
    checks.duplicateReference = { ok: !dupRef, detail: dupRef ? `Reference also used on payment ${dupRef.id}` : "Reference not seen before" };
    if (dupRef) flags.add("DUPLICATE_REFERENCE");
  }
  // 4. Date sanity
  if (payment.paidAt) {
    const tooNew = payment.paidAt > addDays(new Date(), 1);
    const tooOld = payment.paidAt < daysAgo(settings.payment.maxSlipAgeDays + 1);
    checks.date = { ok: !tooNew && !tooOld, detail: tooNew ? "Date is in the future" : tooOld ? `Older than ${settings.payment.maxSlipAgeDays} days` : "Date within range" };
    if (tooNew || tooOld) flags.add("DATE_OUT_OF_RANGE");
  }

  // 5. AI extraction (assistance only)
  let aiPassed = false;
  let aiConfidence: number | null = null;
  if (settings.payment.aiScreeningEnabled && slip) {
    const buffer = fileIn?.buffer ?? (await readFileBytes(slip.file));
    const extraction = buffer ? await runSlipExtraction({ buffer, mimeType: fileIn?.mimeType ?? slip.file.mimeType }) : { ok: false as const, reason: "Slip file unavailable" };
    if (extraction.ok) {
      const x = extraction.data;
      const aiFlags: string[] = [];
      const aiChecks: Record<string, { ok: boolean; detail: string }> = {};
      if (!x.is_payment_receipt) aiFlags.push("NOT_A_RECEIPT");
      // The customer only uploads the slip: fill reference/date from what AI read, then run the same duplicate/date checks.
      const aiRef = x.reference_number ? normalizeReference(x.reference_number) : "";
      if (!payment.referenceNormalized && aiRef) {
        await prisma.payment.update({ where: { id: paymentId }, data: { referenceNumber: x.reference_number!.slice(0, 64), referenceNormalized: aiRef } });
        const dupRef = await prisma.payment.findFirst({
          where: { referenceNormalized: aiRef, id: { not: paymentId }, status: { notIn: ["CANCELLED"] }, NOT: { userId: payment.userId, status: "REJECTED" } },
          select: { id: true },
        });
        aiChecks.duplicateReference = { ok: !dupRef, detail: dupRef ? `Reference ${x.reference_number} also used on payment ${dupRef.id}` : `Reference ${x.reference_number} not seen before` };
        if (dupRef) flags.add("DUPLICATE_REFERENCE");
      }
      if (!payment.paidAt && x.transaction_date && /^\d{4}-\d{2}-\d{2}$/.test(x.transaction_date)) {
        const paidAt = new Date(`${x.transaction_date}T12:00:00+05:00`);
        if (!Number.isNaN(paidAt.getTime())) {
          await prisma.payment.update({ where: { id: paymentId }, data: { paidAt } });
          const outOfRange = paidAt > addDays(new Date(), 1) || paidAt < daysAgo(settings.payment.maxSlipAgeDays + 1);
          aiChecks.date = { ok: !outOfRange, detail: `Slip date ${x.transaction_date}` };
          if (outOfRange) flags.add("DATE_OUT_OF_RANGE");
        }
      }
      const amountLaari = x.amount !== null ? Math.round(x.amount * 100) : null;
      aiChecks.amount = { ok: amountLaari === payment.amount, detail: `Slip: ${amountLaari !== null ? formatMVR(amountLaari) : "unreadable"} · expected ${formatMVR(payment.amount)}` };
      if (amountLaari !== payment.amount) aiFlags.push("AMOUNT_MISMATCH");
      if (x.currency && !/MVR|RF|RUFIYAA/i.test(x.currency)) aiFlags.push("CURRENCY_MISMATCH");
      if (x.reference_number && payment.referenceNormalized) {
        const ok = normalizeReference(x.reference_number) === payment.referenceNormalized || normalizeReference(x.reference_number).includes(payment.referenceNormalized);
        aiChecks.reference = { ok, detail: `Slip: ${x.reference_number} · entered ${payment.referenceNumber}` };
        if (!ok) aiFlags.push("REFERENCE_MISMATCH");
      }
      if (x.recipient_account) {
        const accounts = [settings.payment.accountNumber, settings.payment.secondaryAccountNumber].filter(Boolean).map((a) => a.replace(/\D/g, ""));
        const seen = x.recipient_account.replace(/[^0-9*xX]/g, "");
        const visibleDigits = seen.replace(/[*xX]/g, "");
        const ok = accounts.some((a) => a === seen || (visibleDigits.length >= 4 && a.endsWith(visibleDigits.slice(-4))));
        aiChecks.recipient = { ok, detail: `Slip recipient: ${x.recipient_account}` };
        if (!ok) aiFlags.push("RECIPIENT_MISMATCH");
      }
      if (x.confidence < settings.payment.aiConfidenceThreshold) aiFlags.push("LOW_CONFIDENCE");
      aiFlags.forEach((f) => flags.add(f));
      aiPassed = aiFlags.length === 0;
      aiConfidence = x.confidence;
      await prisma.aiVerification.create({
        data: {
          paymentId,
          provider: "anthropic",
          model: extraction.model,
          status: aiPassed ? "PASSED" : "FLAGGED",
          confidence: x.confidence,
          extractedAmount: amountLaari,
          extractedReference: x.reference_number,
          extractedDate: x.transaction_date,
          extractedAccount: x.recipient_account,
          extractedPayer: x.payer_name,
          checks: { ...checks, ...aiChecks, notes: { ok: true, detail: x.notes } } as Prisma.InputJsonValue,
          summary: aiPassed ? "Slip details match the expected payment." : `Needs a human look: ${aiFlags.map((f) => FLAG_LABELS[f] ?? f).join("; ")}.`,
        },
      });
    } else {
      await prisma.aiVerification.create({
        data: {
          paymentId,
          provider: "anthropic",
          model: extraction.model ?? null,
          status: aiConfigured() ? "ERROR" : "UNAVAILABLE",
          checks: checks as Prisma.InputJsonValue,
          summary: `AI screening unavailable (${extraction.reason}). Rule checks ${flags.size ? "raised flags" : "passed"}; human review required.`,
        },
      });
    }
  } else {
    await prisma.aiVerification.create({
      data: { paymentId, provider: "rules", status: flags.size ? "FLAGGED" : "PASSED", checks: checks as Prisma.InputJsonValue, summary: flags.size ? "Rule checks raised flags." : "Rule checks passed; human review required." },
    });
  }

  let status: PaymentStatus = flags.size > 0 ? "NEEDS_REVIEW" : "PENDING";
  if (status === "PENDING" && settings.payment.aiAutoApprove && aiPassed && (aiConfidence ?? 0) >= settings.payment.aiConfidenceThreshold) status = "VERIFIED";

  await prisma.payment.update({ where: { id: paymentId }, data: { status, flags: [...flags] } });
  if (status === "VERIFIED") await applyVerifiedPayment(paymentId, null, "Automatically verified after screening");
  return status;
}

async function applyVerifiedPayment(paymentId: string, adminId: string | null, note: string | null) {
  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "VERIFIED", verifiedAt: new Date(), reviewedById: adminId, reviewedAt: adminId ? new Date() : null, reviewNote: note },
    include: { listing: true, cancellationFine: { include: { cancellation: { include: { listing: true } } } }, subscription: { include: { plan: true, business: true } } },
  });
  if (payment.purpose === "LISTING_FEE" && payment.listing) {
    if (payment.listing.status === "PAYMENT_REVIEW" || payment.listing.status === "REJECTED" || payment.listing.status === "PENDING_PAYMENT") {
      await publishListing(payment.listing.id, adminId);
    }
  } else if (payment.purpose === "CANCELLATION_FINE" && payment.cancellationFine) {
    await prisma.cancellationFine.update({ where: { id: payment.cancellationFine.id }, data: { status: "PAID", paidAt: new Date() } });
    await notify(payment.userId, { type: "payment", title: "Cancellation fee paid", body: `Your payment of ${formatMVR(payment.amount)} was verified. Thank you.`, link: "/account/cancellations", event: "paymentVerified" });
  } else if (payment.purpose === "BUSINESS_SUBSCRIPTION" && payment.subscription) {
    const { activateSubscription } = await import("./business");
    await activateSubscription(payment.subscription.id);
    await notify(payment.userId, { type: "payment", title: "Business plan active", body: `Your ${payment.subscription.plan.name} plan for ${payment.subscription.business.name} is now active.`, link: "/account/business", event: "paymentVerified" });
  }
  if (adminId) await audit({ actorId: adminId, action: "payment.verify", entityType: "Payment", entityId: paymentId, summary: `Verified ${formatMVR(payment.amount)} (${payment.purpose})${note ? `: ${note}` : ""}` });
}

export async function adminVerifyPayment(paymentId: string, adminId: string, note: string) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p) throw new NotFoundError();
  if (!["AI_CHECKING", "PENDING", "NEEDS_REVIEW"].includes(p.status)) throw new UserError(`A ${p.status.toLowerCase()} payment cannot be verified.`);
  if (p.flags.length > 0 && !note.trim()) throw new UserError("This payment has screening flags. Add a note explaining why you are verifying it.");
  await applyVerifiedPayment(paymentId, adminId, note.trim() || null);
}

export async function adminRejectPayment(paymentId: string, adminId: string, reason: string) {
  if (!reason.trim()) throw new UserError("A reason is required. It will be shown to the customer.");
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { listing: true } });
  if (!p) throw new NotFoundError();
  if (!["AI_CHECKING", "PENDING", "NEEDS_REVIEW"].includes(p.status)) throw new UserError(`A ${p.status.toLowerCase()} payment cannot be rejected.`);
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { status: "REJECTED", rejectionReason: reason, reviewedById: adminId, reviewedAt: new Date() } });
    if (p.listingId && p.listing?.status === "PAYMENT_REVIEW") await tx.listing.update({ where: { id: p.listingId }, data: { status: "REJECTED" } });
    if (p.cancellationFineId) await tx.cancellationFine.update({ where: { id: p.cancellationFineId }, data: { status: "UNPAID" } });
  });
  await audit({ actorId: adminId, action: "payment.reject", entityType: "Payment", entityId: paymentId, summary: `Rejected payment: ${reason}` });
  await notify(p.userId, {
    type: "payment",
    title: "We couldn't verify your payment",
    body: `Our team could not verify your payment of ${formatMVR(p.amount)}. Reason: ${reason}. You can upload a new slip, or contact support if you believe this is a mistake.`,
    link: p.purpose === "LISTING_FEE" && p.listingId ? `/sell/${p.listingId}/pay` : p.purpose === "CANCELLATION_FINE" ? "/account/cancellations" : "/account/business",
    event: "paymentRejected",
  });
}

export async function adminRefundPayment(paymentId: string, adminId: string, note: string) {
  if (!note.trim()) throw new UserError("A refund note is required.");
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p) throw new NotFoundError();
  if (p.status !== "VERIFIED") throw new UserError("Only verified payments can be refunded.");
  await prisma.payment.update({ where: { id: paymentId }, data: { status: "REFUNDED", refundedAt: new Date(), refundNote: note, reviewedById: adminId } });
  if (p.cancellationFineId) {
    await prisma.cancellationFine.update({ where: { id: p.cancellationFineId }, data: { status: "WAIVED", waivedAt: new Date() } });
    const fine = await prisma.cancellationFine.findUnique({ where: { id: p.cancellationFineId }, select: { cancellation: { select: { sellerId: true } } } });
    if (fine) await recomputeSellerStats(fine.cancellation.sellerId);
  }
  await audit({ actorId: adminId, action: "payment.refund", entityType: "Payment", entityId: paymentId, summary: `Refunded ${formatMVR(p.amount)}: ${note}` });
  await notify(p.userId, { type: "payment", title: "Payment refunded", body: `Your payment of ${formatMVR(p.amount)} has been refunded. ${note}` });
}

export async function cancelOwnPayment(paymentId: string, userId: string) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p) throw new NotFoundError();
  if (p.userId !== userId) throw new ForbiddenError();
  if (!["PENDING", "NEEDS_REVIEW"].includes(p.status)) throw new UserError("This payment can no longer be cancelled.");
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { status: "CANCELLED" } });
    if (p.listingId) await tx.listing.updateMany({ where: { id: p.listingId, status: "PAYMENT_REVIEW" }, data: { status: "PENDING_PAYMENT" } });
    if (p.cancellationFineId) await tx.cancellationFine.update({ where: { id: p.cancellationFineId }, data: { status: "UNPAID" } });
  });
}

export async function adminRescreenPayment(paymentId: string, adminId: string) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p || !OPEN_PAYMENT_STATUSES.includes(p.status)) throw new UserError("Only open payments can be re-screened.");
  await prisma.payment.update({ where: { id: paymentId }, data: { status: "AI_CHECKING" } });
  await audit({ actorId: adminId, action: "payment.rescreen", entityType: "Payment", entityId: paymentId, summary: "Re-ran payment screening" });
  return screenPayment(paymentId);
}
