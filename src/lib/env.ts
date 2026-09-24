function required(name: string, fallbackForDev?: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (process.env.NODE_ENV !== "production" && fallbackForDev !== undefined) return fallbackForDev;
  throw new Error(`Missing required environment variable ${name}`);
}

export const env = {
  get appUrl() {
    // Public site address. On Vercel, fall back to the stable production domain (never a per-deployment URL).
    const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const vercelDeploy = process.env.VERCEL_URL;
    const url = process.env.APP_URL || (vercelProd ? `https://${vercelProd}` : vercelDeploy ? `https://${vercelDeploy}` : "http://localhost:3000");
    return url.replace(/\/$/, "");
  },
  get authSecret() {
    const s = required("AUTH_SECRET", "dev-only-secret-change-me-0123456789abcdef");
    if (process.env.NODE_ENV === "production" && s.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
    return s;
  },
  get cronSecret() {
    return process.env.CRON_SECRET || "";
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get storageDriver(): "database" | "s3" {
    return process.env.STORAGE_DRIVER === "s3" ? "s3" : "database";
  },
};
