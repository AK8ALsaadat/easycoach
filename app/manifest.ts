import type { MetadataRoute } from "next";
// Colors follow the default (dark) theme canvas so the splash matches the app.
import { PWA_THEME } from "@/lib/pwa";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/me",
    name: "إيزي كوتش",
    short_name: "إيزي كوتش",
    description: "برنامجك وتغذيتك وتقدمك مع مدربك، حتى بدون إنترنت في النادي.",
    start_url: "/me",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "rtl",
    lang: "ar",
    theme_color: PWA_THEME.dark,
    background_color: PWA_THEME.dark,
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
