type Named = { name: string } | null | undefined;
type Atoll = { name: string; code?: string } | null | undefined;

/** Human-readable place for a listing; atoll/island are optional. */
export function placeLabel(p: { location?: Named; island?: Named; atoll?: Atoll; locationDetail?: string | null }, opts: { short?: boolean } = {}) {
  const parts: string[] = [];
  if (!opts.short && p.location) parts.push(p.location.name);
  if (p.island) parts.push(p.island.name);
  if (p.atoll) parts.push(opts.short && p.atoll.code ? p.atoll.code : p.atoll.name);
  let s = parts.join(", ");
  if (!opts.short && p.locationDetail) s = s ? `${s} — ${p.locationDetail}` : p.locationDetail;
  return s || "Maldives";
}
