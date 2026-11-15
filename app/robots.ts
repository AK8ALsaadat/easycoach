import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/coach", "/me", "/trainee/", "/access/", "/p/", "/invite/", "/join/", "/upload/", "/auth/", "/login", "/verify-email", "/logout", "/organization", "/attendance", "/reports", "/start", "/pricing", "/subscription", "/payments/", "/offline"] },
    sitemap: new URL("/sitemap.xml", siteUrl()).href,
  };
}
