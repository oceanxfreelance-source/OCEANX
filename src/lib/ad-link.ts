import { UserError } from "./errors";

/** Ad links: a page on this site ("/sell") or a sponsor's website (https only; "www.x.com" is accepted). */
export function normalizeAdLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return v.slice(0, 500);
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    throw new UserError("Enter a valid link, e.g. /sell or https://sponsor.mv");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new UserError("Ad links must start with https://");
  return u.toString().slice(0, 500);
}
