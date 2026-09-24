import { env } from "./env";

/** Defence-in-depth CSRF check for route handlers: the request must come from our own origin. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  try {
    const o = new URL(origin);
    return o.host === host || o.origin === new URL(env.appUrl).origin;
  } catch {
    return false;
  }
}
