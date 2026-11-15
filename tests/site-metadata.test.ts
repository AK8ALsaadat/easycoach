import { afterEach, expect, it, vi } from "vitest";
import { siteUrl } from "@/lib/site-url";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
afterEach(() => vi.unstubAllEnvs());
it("keeps credentials and paths out of public metadata and safely handles malformed configuration", () => {
  vi.stubEnv("APP_URL", "https://user:secret@example.test/private?token=sensitive");
  expect(siteUrl().href).toBe("https://example.test/");
  vi.stubEnv("APP_URL", "javascript:alert(1)");
  expect(siteUrl().protocol).toBe("https:");
});
it("only lists the landing page and disallows private and billing routes", () => {
  vi.stubEnv("APP_URL", "https://example.test");
  expect(sitemap().map(entry => entry.url)).toEqual(["https://example.test/"]);
  const rules = robots().rules as { disallow: string[] };
  for (const route of ["/api/", "/coach", "/access/", "/p/", "/trainee/", "/subscription", "/payments/"]) expect(rules.disallow).toContain(route);
  expect(robots().sitemap).toBe("https://example.test/sitemap.xml");
});
