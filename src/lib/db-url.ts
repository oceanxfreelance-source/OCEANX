/**
 * Neon (and similar) "pooled" URLs go through PgBouncer in transaction mode, which needs
 * `pgbouncer=true` for Prisma. This lets people paste the provider's URL exactly as given.
 */
export function runtimeDatabaseUrl(url = process.env.DATABASE_URL): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname.includes("-pooler.") && !u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    return u.toString();
  } catch {
    return url;
  }
}
