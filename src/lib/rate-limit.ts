import { prisma } from "./db";
import { UserError } from "./errors";

/**
 * Fixed-window rate limiter stored in Postgres so it works across serverless instances.
 * Returns true when the action is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 1) <= limit;
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message = "Too many attempts. Please wait a moment and try again.") {
  if (!(await rateLimit(key, limit, windowSeconds))) throw new UserError(message, "RATE_LIMITED");
}

export async function purgeExpiredRateLimits() {
  await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
}
