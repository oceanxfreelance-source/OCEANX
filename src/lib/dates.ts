export const DAY_MS = 86_400_000;

export function daysAgo(days: number, from = new Date()): Date {
  return new Date(from.getTime() - days * DAY_MS);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Calendar month addition that clamps to the last day of the month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}

/** Maldives time (UTC+5, no DST). */
export const MV_OFFSET_MS = 5 * 3600_000;

export function startOfMvDay(d = new Date()): Date {
  const local = new Date(d.getTime() + MV_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - MV_OFFSET_MS);
}

export function monthRange(month: string): { start: Date; end: Date } {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error("Month must be YYYY-MM");
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  return { start: new Date(Date.UTC(y, mo, 1) - MV_OFFSET_MS), end: new Date(Date.UTC(y, mo + 1, 1) - MV_OFFSET_MS) };
}

export function currentMonth(d = new Date()): string {
  const local = new Date(d.getTime() + MV_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Indian/Maldives" });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Indian/Maldives" });
}

export function timeAgo(d: Date | string): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(d);
}

/** Parses <input type="datetime-local"> / <input type="date"> values as Maldives local time. */
export function parseMvDateTime(v: string): Date {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return new Date(`${v}:00+05:00`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00+05:00`);
  return new Date(v);
}
