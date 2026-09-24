/** All amounts are stored as integer laari (1 MVR = 100 laari). */
export function formatMVR(laari: number | null | undefined, opts: { free?: string } = {}): string {
  if (laari === null || laari === undefined) return "—";
  if (laari === 0 && opts.free) return opts.free;
  const mvr = laari / 100;
  const hasCents = laari % 100 !== 0;
  return `MVR ${mvr.toLocaleString("en-US", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function mvrToLaari(value: string | number): number {
  const n = typeof value === "number" ? value : Number(String(value).replace(/[, ]/g, ""));
  if (!Number.isFinite(n)) throw new Error("Invalid amount");
  return Math.round(n * 100);
}

export function laariToMvr(laari: number): number {
  return laari / 100;
}
