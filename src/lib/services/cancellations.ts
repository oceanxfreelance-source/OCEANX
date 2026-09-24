import type { CancellationOutcome } from "@prisma/client";
import { prisma } from "../db";
import { getSettings, type Settings } from "../settings";
import { UserError, NotFoundError, ForbiddenError } from "../errors";
import { daysAgo } from "../dates";
import { formatMVR } from "../money";
import { notify } from "../notify";
import { audit } from "../audit";
import { recomputeSellerStats } from "./reputation";
import { evaluateVip } from "./vip";

export type CancellationQuote = {
  fine: number;
  reason: "fine" | "grace" | "disabled";
  graceEndsAt: Date | null;
  cancellationsInPeriod: number;
  maxPerPeriod: number;
  periodDays: number;
  wouldExceedLimit: boolean;
  consequences: string[];
  allowExceptionRequests: boolean;
};

function consequencesText(s: Settings): string[] {
  const out: string[] = [];
  if (s.cancellation.reduceStars && s.cancellation.starPenalty > 0) out.push(`Each voluntary cancellation removes ${s.cancellation.starPenalty} Star${s.cancellation.starPenalty === 1 ? "" : "s"}.`);
  if (s.cancellation.affectsVipEligibility) out.push(`VIP requires no more than ${s.vip.maxCancellationsInWindow} voluntary cancellations in ${s.vip.windowDays} days.`);
  return out;
}

/** Computes what withdrawing a PUBLISHED listing would cost, shown to the seller BEFORE they confirm. */
export async function quoteCancellation(listingId: string, sellerId: string): Promise<CancellationQuote> {
  const settings = await getSettings();
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new NotFoundError();
  if (listing.sellerId !== sellerId) throw new ForbiddenError();
  if (listing.status !== "PUBLISHED") throw new UserError("Only live published listings can be withdrawn.");
  const c = settings.cancellation;
  const graceEndsAt = c.graceHours > 0 && listing.publishedAt ? new Date(listing.publishedAt.getTime() + c.graceHours * 3600_000) : null;
  const inGrace = !!graceEndsAt && graceEndsAt > new Date();
  const count = await prisma.cancellationRecord.count({ where: { sellerId, countsAgainstSeller: true, createdAt: { gte: daysAgo(c.periodDays) } } });
  const reason: CancellationQuote["reason"] = !c.enabled || c.fineAmount === 0 ? "disabled" : inGrace ? "grace" : "fine";
  const consequences = consequencesText(settings);
  const wouldExceed = count + 1 > c.maxPerPeriod;
  if (wouldExceed) {
    if (c.triggerReviewOverLimit) consequences.push("Your account will be flagged for review by OceanX.");
    if (c.suspendVipOverLimit) consequences.push("Active VIP status will be suspended.");
    if (c.reduceLevelOverLimit) consequences.push("Your seller level will drop by one level.");
  }
  return {
    fine: reason === "fine" ? c.fineAmount : 0,
    reason,
    graceEndsAt,
    cancellationsInPeriod: count,
    maxPerPeriod: c.maxPerPeriod,
    periodDays: c.periodDays,
    wouldExceedLimit: wouldExceed,
    consequences,
    allowExceptionRequests: c.allowExceptionRequests,
  };
}

/**
 * Voluntary withdrawal of a published listing. The seller must explicitly confirm the fine amount
 * they were shown (expectedFine) — if the rules changed in between, the request is rejected.
 * Drafts, unpublished, admin-removed and SOLD listings never reach this function.
 */
export async function withdrawListing(
  listingId: string,
  sellerId: string,
  opts: { confirmed: boolean; expectedFine: number; reason?: string; exceptionRequest?: string },
) {
  if (!opts.confirmed) throw new UserError("Please confirm that you want to withdraw this listing.");
  const settings = await getSettings();
  const quote = await quoteCancellation(listingId, sellerId);
  if (quote.fine !== opts.expectedFine) throw new UserError("The cancellation fee has changed. Please review the new amount and confirm again.", "FINE_CHANGED");

  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
  const exceptionText = (opts.exceptionRequest ?? "").trim().slice(0, 1000);
  const requestingException = quote.fine > 0 && settings.cancellation.allowExceptionRequests && exceptionText.length > 0;
  const outcome: CancellationOutcome = quote.reason === "disabled" ? "NO_FINE_DISABLED" : quote.reason === "grace" ? "NO_FINE_GRACE" : requestingException ? "EXCEPTION_REQUESTED" : "FINED";
  const countsAgainst = quote.reason !== "grace";
  const statsEffect = countsAgainst
    ? settings.cancellation.reduceStars
      ? `Counts as a voluntary cancellation (−${settings.cancellation.starPenalty} Star)`
      : "Counts as a voluntary cancellation"
    : "No effect (within grace period)";
  const vipEffect = countsAgainst && settings.cancellation.affectsVipEligibility ? "Counts toward VIP cancellation limit" : "No effect";

  const record = await prisma.$transaction(async (tx) => {
    const fresh = await tx.listing.updateMany({ where: { id: listingId, status: "PUBLISHED" }, data: { status: "WITHDRAWN", withdrawnAt: new Date() } });
    if (fresh.count !== 1) throw new UserError("This listing is no longer live.");
    return tx.cancellationRecord.create({
      data: {
        listingId,
        sellerId,
        reason: opts.reason?.trim().slice(0, 500) || null,
        exceptionRequest: requestingException ? exceptionText : null,
        fineAmount: quote.fine,
        outcome,
        countsAgainstSeller: countsAgainst,
        affectsVip: countsAgainst && settings.cancellation.affectsVipEligibility,
        statsEffect,
        vipEffect,
        fine: quote.fine > 0 ? { create: { amount: quote.fine, status: requestingException ? "PENDING_EXCEPTION" : "UNPAID" } } : undefined,
      },
      include: { fine: true },
    });
  });

  if (quote.fine > 0) {
    await notify(sellerId, {
      type: "cancellation",
      title: requestingException ? "Cancellation exception requested" : "Cancellation fee due",
      body: requestingException
        ? `You withdrew "${listing.title}" and asked for an exception. OceanX will review your request.`
        : `You withdrew "${listing.title}". A cancellation fee of ${formatMVR(quote.fine)} is due.`,
      link: "/account/cancellations",
      event: "cancellation",
    });
  }
  await recomputeSellerStats(sellerId, settings);
  await evaluateVip(sellerId);
  return record;
}

/** Admin override: waive fine, approve/deny exception, or mark as exceptional (no effect on stats/VIP). */
export async function adminResolveCancellation(
  cancellationId: string,
  adminId: string,
  action: "approve_exception" | "deny_exception" | "waive_fine" | "mark_exceptional" | "reinstate",
  adminReason: string,
) {
  if (!adminReason.trim()) throw new UserError("A reason is required.");
  const rec = await prisma.cancellationRecord.findUnique({ where: { id: cancellationId }, include: { fine: true, listing: true } });
  if (!rec) throw new NotFoundError();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const base = { adminId, adminReason, overriddenAt: now };
    switch (action) {
      case "approve_exception":
      case "mark_exceptional":
        await tx.cancellationRecord.update({
          where: { id: rec.id },
          data: { ...base, outcome: action === "approve_exception" ? "EXCEPTION_APPROVED" : "WAIVED", countsAgainstSeller: false, affectsVip: false, statsEffect: "No effect (exceptional case approved by OceanX)", vipEffect: "No effect" },
        });
        if (rec.fine && rec.fine.status !== "PAID") await tx.cancellationFine.update({ where: { id: rec.fine.id }, data: { status: "WAIVED", waivedAt: now } });
        break;
      case "deny_exception":
        if (rec.outcome !== "EXCEPTION_REQUESTED") throw new UserError("No exception request is pending.");
        await tx.cancellationRecord.update({ where: { id: rec.id }, data: { ...base, outcome: "FINED" } });
        if (rec.fine) await tx.cancellationFine.update({ where: { id: rec.fine.id }, data: { status: "UNPAID" } });
        break;
      case "waive_fine":
        if (!rec.fine || rec.fine.status === "PAID") throw new UserError("There is no unpaid fine to waive.");
        await tx.cancellationRecord.update({ where: { id: rec.id }, data: { ...base, outcome: "WAIVED" } });
        await tx.cancellationFine.update({ where: { id: rec.fine.id }, data: { status: "WAIVED", waivedAt: now } });
        break;
      case "reinstate":
        await tx.cancellationRecord.update({ where: { id: rec.id }, data: { ...base, countsAgainstSeller: true, affectsVip: true } });
        break;
    }
  });
  await audit({ actorId: adminId, action: `cancellation.${action}`, entityType: "CancellationRecord", entityId: rec.id, summary: `${action} for "${rec.listing.title}": ${adminReason}` });
  await notify(rec.sellerId, {
    type: "cancellation",
    title: "Cancellation reviewed",
    body:
      action === "deny_exception"
        ? `Your exception request for "${rec.listing.title}" was not approved: ${adminReason}. The cancellation fee is due.`
        : `OceanX reviewed the cancellation of "${rec.listing.title}": ${adminReason}`,
    link: "/account/cancellations",
    event: "cancellation",
  });
  await recomputeSellerStats(rec.sellerId);
  await evaluateVip(rec.sellerId);
}
