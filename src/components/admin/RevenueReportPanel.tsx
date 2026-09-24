import { Download, FileText } from "lucide-react";
import { MV_OFFSET_MS } from "@/lib/dates";

function mv(d: Date) {
  return new Date(d.getTime() + MV_OFFSET_MS);
}
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Preset date ranges (Maldives time) plus a custom range, each downloading a PDF. */
export function RevenueReportPanel() {
  const now = mv(new Date());
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const today = ymd(now);
  const presets = [
    { label: "This month", from: ymd(new Date(Date.UTC(y, m, 1))), to: today },
    { label: "Last month", from: ymd(new Date(Date.UTC(y, m - 1, 1))), to: ymd(new Date(Date.UTC(y, m, 0))) },
    { label: "Last 30 days", from: ymd(new Date(now.getTime() - 29 * 86_400_000)), to: today },
    { label: "This year", from: `${y}-01-01`, to: today },
  ];
  const href = (from: string, to: string) => `/api/admin/reports/revenue?from=${from}&to=${to}`;
  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ocean-50 text-ocean-700">
          <FileText className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div>
          <h2 className="font-semibold">Revenue report (PDF)</h2>
          <p className="text-sm text-slate-500">Summary by source, refunds, VIP rewards, a revenue chart and every transaction in the period.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {presets.map((p) => (
          <a key={p.label} href={href(p.from, p.to)} className="btn-secondary btn-sm" download>
            <Download className="h-3.5 w-3.5" /> {p.label}
          </a>
        ))}
      </div>
      <form action="/api/admin/reports/revenue" method="get" className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-medium text-slate-600">
          From
          <input type="date" name="from" required defaultValue={presets[0].from} max={today} className="input mt-1" />
        </label>
        <label className="text-xs font-medium text-slate-600">
          To
          <input type="date" name="to" required defaultValue={today} max={today} className="input mt-1" />
        </label>
        <button className="btn-primary">
          <Download className="h-4 w-4" /> Download PDF
        </button>
      </form>
    </section>
  );
}
