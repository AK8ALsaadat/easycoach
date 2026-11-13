import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.EASYCOACH_EVIDENCE_DIST_DIR || ".next",
  serverExternalPackages: ["@electric-sql/pglite", "exceljs"],
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  // Each build registers /sw.js?v=<build>, so a deploy is offered as an update.
  env: {
    NEXT_PUBLIC_APP_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? Date.now().toString(36)).slice(0, 16),
  },
  async headers() {
    return [
      {
        // The worker must always be revalidated so updates are detected promptly.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
};
export default config;
