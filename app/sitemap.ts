import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/** Only the indexable landing page. Never include private routes or tokens. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: siteUrl().href, changeFrequency: "monthly", priority: 1 }];
}
