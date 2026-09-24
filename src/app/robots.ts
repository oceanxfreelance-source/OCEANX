import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/messages", "/sell", "/api", "/admin-verify"] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
