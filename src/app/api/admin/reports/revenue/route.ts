import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { buildRevenueReport, parseReportRange, renderRevenuePdf } from "@/lib/services/revenue-report";

export const maxDuration = 60;

/** GET /api/admin/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD → PDF download (finance permission only). */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin || !hasPermission(admin.permissions, "finance")) return new NextResponse("Not found", { status: 404 });
  const url = new URL(req.url);
  try {
    const range = parseReportRange(url.searchParams.get("from"), url.searchParams.get("to"));
    const [report, settings] = await Promise.all([buildRevenueReport(range), getSettings()]);
    const pdf = await renderRevenuePdf(report, { marketplace: settings.general.marketplaceName, generatedBy: admin.user.name });
    await audit({ actorId: admin.user.id, action: "finance.report_download", entityType: "Report", summary: `Revenue PDF ${range.from} to ${range.to}` });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="mvmarkets-revenue-${range.from}-to-${range.to}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof UserError) return new NextResponse(e.message, { status: 400 });
    throw e;
  }
}
