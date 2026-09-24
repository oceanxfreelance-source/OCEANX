import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/db";
import { buildRevenueReport, parseReportRange, renderRevenuePdf } from "@/lib/services/revenue-report";
import { makeUser, publishedListing, resetSettings } from "./helpers";

beforeAll(resetSettings);

describe("revenue report PDF", () => {
  it("validates the date range", () => {
    expect(() => parseReportRange("2026-01-10", "2026-01-01")).toThrow(/on or after/);
    expect(() => parseReportRange("bad", "2026-01-01")).toThrow(/valid/);
    const r = parseReportRange("2026-01-01", "2026-01-31");
    expect(r.end.getTime() - r.start.getTime()).toBe(31 * 86_400_000);
  });

  it("totals verified revenue in range and renders a multi-section PDF", async () => {
    const seller = await makeUser({ name: "Mariyam Ålesund 🌴 ދިވެހި" }); // non-Latin characters must not break the PDF
    await publishedListing(seller.id);
    await prisma.revenueEntry.create({ data: { category: "Advertising", amount: 50_000, occurredAt: new Date(), note: "Banner ad" } });
    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    const report = await buildRevenueReport(parseReportRange(today, today));
    const verified = await prisma.payment.aggregate({ where: { status: "VERIFIED", verifiedAt: { gte: report.range.start, lt: report.range.end } }, _sum: { amount: true } });
    expect(report.totals.posting + report.totals.fines + report.totals.subscriptions).toBe(verified._sum.amount ?? 0);
    expect(report.totals.other).toBeGreaterThanOrEqual(50_000);
    expect(report.totals.total).toBe(report.totals.posting + report.totals.subscriptions + report.totals.fines + report.totals.other);
    expect(report.transactions.length).toBeGreaterThan(0);

    const pdf = await renderRevenuePdf(report, { marketplace: "MV MARKETS", generatedBy: "Admin" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const parsed = await PDFDocument.load(pdf);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("paginates long transaction lists", async () => {
    const start = new Date("2025-03-01T00:00:00+05:00");
    await prisma.revenueEntry.createMany({ data: Array.from({ length: 120 }, (_, i) => ({ category: "Test", amount: 100 + i, occurredAt: new Date(start.getTime() + i * 3600_000) })) });
    const report = await buildRevenueReport(parseReportRange("2025-03-01", "2025-03-10"));
    expect(report.transactions).toHaveLength(120);
    const pdf = await renderRevenuePdf(report, { marketplace: "MV MARKETS", generatedBy: "Admin" });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
  });
});
