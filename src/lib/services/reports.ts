import type { ReportReason, ReportStatus } from "@prisma/client";
import { prisma } from "../db";
import { UserError, NotFoundError } from "../errors";
import { enforceRateLimit } from "../rate-limit";
import { cleanText } from "../validation";
import { getSettings } from "../settings";
import { audit } from "../audit";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "SCAM", label: "Scam or fraud" },
  { value: "PROHIBITED_ITEM", label: "Prohibited or illegal item" },
  { value: "MISLEADING", label: "Misleading information" },
  { value: "WRONG_CATEGORY", label: "Wrong category" },
  { value: "DUPLICATE", label: "Duplicate listing" },
  { value: "ALREADY_SOLD", label: "Item already sold" },
  { value: "OFFENSIVE", label: "Offensive content" },
  { value: "OTHER", label: "Other" },
];

export async function createReport(reporterId: string, input: { listingId?: string; targetUserId?: string; reason: string; details?: string }) {
  await enforceRateLimit(`report:${reporterId}`, 10, 3600, "You have sent many reports recently. Please try later.");
  if (!REPORT_REASONS.some((r) => r.value === input.reason)) throw new UserError("Choose a reason.");
  if (!input.listingId && !input.targetUserId) throw new UserError("Nothing to report.");
  let targetUserId = input.targetUserId ?? null;
  if (input.listingId) {
    const l = await prisma.listing.findUnique({ where: { id: input.listingId } });
    if (!l) throw new NotFoundError();
    if (l.sellerId === reporterId) throw new UserError("You cannot report your own listing.");
    targetUserId = l.sellerId;
    const already = await prisma.report.findFirst({ where: { reporterId, listingId: input.listingId, status: { in: ["OPEN", "REVIEWING"] } } });
    if (already) throw new UserError("You have already reported this listing. Our team is reviewing it.");
  }
  if (targetUserId === reporterId) throw new UserError("You cannot report yourself.");
  const report = await prisma.report.create({
    data: { reporterId, listingId: input.listingId ?? null, targetUserId, reason: input.reason as ReportReason, details: input.details ? cleanText(input.details, 1000) : null },
  });
  // Optional auto-hide once enough distinct users report a listing.
  if (input.listingId) {
    const settings = await getSettings();
    const threshold = settings.moderation.autoHideReportThreshold;
    if (threshold > 0) {
      const distinct = await prisma.report.groupBy({ by: ["reporterId"], where: { listingId: input.listingId, status: { in: ["OPEN", "REVIEWING"] } } });
      if (distinct.length >= threshold) {
        await prisma.listing.updateMany({ where: { id: input.listingId, status: "PUBLISHED" }, data: { status: "REMOVED", removedAt: new Date(), removedReason: "Hidden pending review after multiple reports" } });
      }
    }
  }
  return report;
}

export async function adminHandleReport(reportId: string, adminId: string, status: ReportStatus, resolution: string) {
  const r = await prisma.report.findUnique({ where: { id: reportId } });
  if (!r) throw new NotFoundError();
  await prisma.report.update({ where: { id: reportId }, data: { status, resolution: resolution || null, handledById: adminId, handledAt: new Date() } });
  await audit({ actorId: adminId, action: `report.${status.toLowerCase()}`, entityType: "Report", entityId: reportId, summary: resolution || status });
}
