import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PaymentPurpose } from "@prisma/client";
import { prisma } from "../db";
import { formatMVR } from "../money";
import { MV_OFFSET_MS } from "../dates";
import { UserError } from "../errors";

/** Revenue report for a Maldives-time date range (inclusive), as numbers and as a PDF. */

export type RevenueReport = Awaited<ReturnType<typeof buildRevenueReport>>;

const PURPOSE_LABEL: Record<PaymentPurpose, string> = {
  LISTING_FEE: "Posting fee",
  CANCELLATION_FINE: "Cancellation fine",
  BUSINESS_SUBSCRIPTION: "Business subscription",
};

export function parseReportRange(fromRaw?: string | null, toRaw?: string | null) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!fromRaw || !toRaw || !re.test(fromRaw) || !re.test(toRaw)) throw new UserError("Choose a valid start and end date.");
  const start = new Date(`${fromRaw}T00:00:00+05:00`);
  const end = new Date(new Date(`${toRaw}T00:00:00+05:00`).getTime() + 86_400_000); // exclusive
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new UserError("The end date must be on or after the start date.");
  if (end.getTime() - start.getTime() > 3 * 366 * 86_400_000) throw new UserError("Reports can cover at most 3 years.");
  return { start, end, from: fromRaw, to: toRaw };
}

function mvDay(d: Date) {
  return new Date(d.getTime() + MV_OFFSET_MS).toISOString().slice(0, 10);
}

export async function buildRevenueReport(range: { start: Date; end: Date; from: string; to: string }) {
  const { start, end } = range;
  const [payments, other, refunds, rewardsPaid] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "VERIFIED", verifiedAt: { gte: start, lt: end } },
      orderBy: { verifiedAt: "asc" },
      select: { id: true, purpose: true, amount: true, isVipRate: true, verifiedAt: true, referenceNumber: true, user: { select: { name: true } } },
    }),
    prisma.revenueEntry.findMany({ where: { occurredAt: { gte: start, lt: end } }, orderBy: { occurredAt: "asc" } }),
    prisma.payment.findMany({ where: { status: "REFUNDED", refundedAt: { gte: start, lt: end } }, select: { amount: true } }),
    prisma.vipRewardPayment.aggregate({ where: { paidAt: { gte: start, lt: end } }, _sum: { amount: true }, _count: true }),
  ]);

  const sum = (p: PaymentPurpose) => payments.filter((x) => x.purpose === p).reduce((a, x) => a + x.amount, 0);
  const posting = sum("LISTING_FEE");
  const subscriptions = sum("BUSINESS_SUBSCRIPTION");
  const fines = sum("CANCELLATION_FINE");
  const otherTotal = other.reduce((a, x) => a + x.amount, 0);
  const total = posting + subscriptions + fines + otherTotal;
  const refundTotal = refunds.reduce((a, x) => a + x.amount, 0);
  const rewards = rewardsPaid._sum.amount ?? 0;

  // Group by day for short ranges, by month otherwise.
  const byMonth = end.getTime() - start.getTime() > 62 * 86_400_000;
  const buckets = new Map<string, number>();
  for (const p of payments) {
    const k = byMonth ? mvDay(p.verifiedAt!).slice(0, 7) : mvDay(p.verifiedAt!);
    buckets.set(k, (buckets.get(k) ?? 0) + p.amount);
  }
  for (const o of other) {
    const k = byMonth ? mvDay(o.occurredAt).slice(0, 7) : mvDay(o.occurredAt);
    buckets.set(k, (buckets.get(k) ?? 0) + o.amount);
  }

  return {
    range,
    totals: { posting, subscriptions, fines, other: otherTotal, total, refunds: refundTotal, refundCount: refunds.length, rewards, rewardCount: rewardsPaid._count, net: total - refundTotal - rewards },
    counts: {
      payments: payments.length,
      postings: payments.filter((p) => p.purpose === "LISTING_FEE").length,
      vipRatePostings: payments.filter((p) => p.purpose === "LISTING_FEE" && p.isVipRate).length,
    },
    breakdown: { unit: byMonth ? "Month" : "Day", rows: [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)) },
    transactions: [
      ...payments.map((p) => ({ date: p.verifiedAt!, type: PURPOSE_LABEL[p.purpose] + (p.isVipRate ? " (VIP rate)" : ""), who: p.user.name, ref: p.referenceNumber ?? "", amount: p.amount })),
      ...other.map((o) => ({ date: o.occurredAt, type: `Other: ${o.category}`, who: "", ref: o.note ?? "", amount: o.amount })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime()),
  };
}

// ─────────────── PDF rendering ───────────────

/** Standard PDF fonts only cover Latin-1; replace anything else so names in other scripts never break the file. */
function safe(text: string) {
  return text.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function fit(text: string, font: PDFFont, size: number, width: number) {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > width) t = t.slice(0, -1);
  return t + "...";
}

export async function renderRevenuePdf(report: RevenueReport, meta: { marketplace: string; generatedBy: string }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${meta.marketplace} revenue ${report.range.from} to ${report.range.to}`);
  doc.setAuthor("OceanX");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.4, 0.45, 0.52);
  const line = rgb(0.88, 0.9, 0.93);
  const brand = rgb(0.11, 0.36, 0.55);
  const W = 595.28;
  const H = 841.89;
  const M = 48;

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  let pageNo = 1;

  const text = (t: string, x: number, size = 10, f = font, color = ink) => page.drawText(safe(t), { x, y, size, font: f, color });
  const right = (t: string, xRight: number, size = 10, f = font, color = ink) => {
    const s = safe(t);
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y, size, font: f, color });
  };
  const footer = () => {
    const s = `${meta.marketplace} - Revenue report - Page ${pageNo}`;
    page.drawText(s, { x: M, y: 28, size: 8, font, color: muted });
  };
  const ensure = (needed: number) => {
    if (y - needed < 56) {
      footer();
      page = doc.addPage([W, H]);
      pageNo++;
      y = H - M;
    }
  };
  const rule = () => page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.6, color: line });

  // Header band
  page.drawRectangle({ x: 0, y: H - 110, width: W, height: 110, color: rgb(0.04, 0.07, 0.13) });
  y = H - 52;
  text(meta.marketplace.toUpperCase(), M, 9, bold, rgb(0.55, 0.72, 0.86));
  y -= 24;
  text("Revenue report", M, 22, bold, rgb(1, 1, 1));
  y -= 18;
  text(`${report.range.from}  to  ${report.range.to}  (Maldives time)`, M, 10, font, rgb(0.75, 0.8, 0.86));
  y = H - 140;
  text(`Generated ${new Date(Date.now() + MV_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ")} by ${meta.generatedBy}`, M, 8, font, muted);
  y -= 28;

  // KPI boxes
  const kpis: [string, string][] = [
    ["Total revenue", formatMVR(report.totals.total)],
    ["Net after refunds & rewards", formatMVR(report.totals.net)],
    ["Verified payments", String(report.counts.payments)],
  ];
  const boxW = (W - 2 * M - 16) / 3;
  kpis.forEach(([k, v], i) => {
    const x = M + i * (boxW + 8);
    page.drawRectangle({ x, y: y - 44, width: boxW, height: 56, borderColor: line, borderWidth: 0.8, color: rgb(0.98, 0.985, 0.99) });
    page.drawText(safe(k), { x: x + 10, y: y - 2, size: 8, font, color: muted });
    page.drawText(safe(v), { x: x + 10, y: y - 28, size: 15, font: bold, color: i === 0 ? brand : ink });
  });
  y -= 76;

  const section = (title: string) => {
    ensure(40);
    text(title, M, 12, bold);
    y -= 18;
  };

  section("Summary by source");
  const summary: [string, number, boolean?][] = [
    ["Posting fees", report.totals.posting],
    ["Business subscriptions", report.totals.subscriptions],
    ["Cancellation fines", report.totals.fines],
    ["Other recorded revenue", report.totals.other],
    ["Total revenue", report.totals.total, true],
    [`Refunds (${report.totals.refundCount})`, report.totals.refunds ? -report.totals.refunds : 0],
    [`VIP rewards paid (${report.totals.rewardCount})`, report.totals.rewards ? -report.totals.rewards : 0],
    ["Net", report.totals.net, true],
  ];
  for (const [label, amount, strong] of summary) {
    ensure(18);
    text(label, M, 10, strong ? bold : font);
    right(formatMVR(amount), W - M, 10, strong ? bold : font);
    y -= 6;
    rule();
    y -= 12;
  }
  y -= 4;
  text(`${report.counts.postings} paid listings, of which ${report.counts.vipRatePostings} at the VIP rate.`, M, 9, font, muted);
  y -= 26;

  if (report.breakdown.rows.length) {
    section(`Revenue by ${report.breakdown.unit.toLowerCase()}`);
    const max = Math.max(...report.breakdown.rows.map(([, v]) => v), 1);
    for (const [k, v] of report.breakdown.rows) {
      ensure(16);
      text(k, M, 9);
      const barX = M + 90;
      const barMax = W - 2 * M - 90 - 90;
      page.drawRectangle({ x: barX, y: y - 1, width: Math.max(1, (Math.max(v, 0) / max) * barMax), height: 8, color: brand });
      right(formatMVR(v), W - M, 9);
      y -= 15;
    }
    y -= 14;
  }

  section(`Transactions (${report.transactions.length})`);
  const cols = { date: M, type: M + 70, who: M + 210, ref: M + 330, amt: W - M };
  const head = () => {
    text("Date", cols.date, 8, bold, muted);
    text("Type", cols.type, 8, bold, muted);
    text("Customer", cols.who, 8, bold, muted);
    text("Reference / note", cols.ref, 8, bold, muted);
    right("Amount", cols.amt, 8, bold, muted);
    y -= 6;
    rule();
    y -= 12;
  };
  head();
  if (!report.transactions.length) {
    text("No revenue in this period.", M, 9, font, muted);
    y -= 14;
  }
  for (const t of report.transactions) {
    if (y - 14 < 56) {
      ensure(1000);
      head();
    }
    text(mvDay(t.date), cols.date, 8.5);
    page.drawText(fit(t.type, font, 8.5, 135), { x: cols.type, y, size: 8.5, font, color: ink });
    page.drawText(fit(t.who, font, 8.5, 115), { x: cols.who, y, size: 8.5, font, color: ink });
    page.drawText(fit(t.ref, font, 8.5, 110), { x: cols.ref, y, size: 8.5, font, color: muted });
    right(formatMVR(t.amount), cols.amt, 8.5);
    y -= 14;
  }
  footer();
  return Buffer.from(await doc.save());
}
