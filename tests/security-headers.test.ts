import { afterEach, expect, it, vi } from "vitest";
import config from "../next.config";
afterEach(() => vi.unstubAllEnvs());
it("applies HSTS and form protection to every HTTPS page, not just assets", async () => {
  vi.stubEnv("APP_URL", "https://example.test");
  const rules = await config.headers!();
  const global = rules.find(rule => rule.source === "/(.*)")!;
  expect(global.headers).toContainEqual({ key: "Strict-Transport-Security", value: "max-age=31536000" });
  expect(global.headers.find(header => header.key === "Content-Security-Policy")?.value).toContain("form-action 'self'");
  expect(config.poweredByHeader).toBe(false);
});
it("does not pin local HTTP hosts to HTTPS and keeps the worker uncached", async () => {
  vi.stubEnv("APP_URL", "http://127.0.0.1:3200");
  const rules = await config.headers!();
  expect(rules.flatMap(rule => rule.headers).some(header => header.key === "Strict-Transport-Security")).toBe(false);
  expect(rules.find(rule => rule.source === "/sw.js")?.headers.find(header => header.key === "Cache-Control")?.value).toContain("no-store");
});
