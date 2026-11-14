import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
await mkdir("artifacts/policy-release", { recursive: true });
const base = process.env.TEST_BASE_URL;
assert(base && new URL(base).hostname === "127.0.0.1", "Local fixtures only");
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
try {
  const context = await browser.newContext({ reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": `policy-dialogs-${crypto.randomUUID()}` } });
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/login"); await page.waitForLoadState("networkidle");
  await page.locator("#auth-email").fill("coach@example.test"); await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator('button[type="submit"]').click(); await page.waitForURL("**/coach");
  const data = await (await page.request.get(base + "/api/export")).json();
  const client = data.clients.find(c => c.email === "trainee@example.test"); assert(client);
  for (const theme of ["light", "dark"]) {
    await context.addCookies([{ name: "ec_theme", value: theme, url: base }]);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + "/coach"); await page.waitForLoadState("networkidle");
      const support = page.getByRole("button", { name: "الدعم والاقتراحات", exact: true });
      await support.click();
      await page.screenshot({ path: `artifacts/policy-release/support-opening-${theme}-${width}.png`, fullPage: true });
      const dialog = page.getByRole("dialog", { name: "كيف نقدر نساعدك؟", exact: true }); await dialog.waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(await dialog.locator('input[name="title"]').evaluate(input => input === document.activeElement));
      await page.screenshot({ path: `artifacts/policy-release/support-${theme}-${width}.png`, fullPage: true });
      await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
      assert(await support.evaluate(button => button === document.activeElement));
      await page.goto(`${base}/coach/clients/${client.id}/edit`); await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "اختيار التمارين", exact: true }).click();
      await page.locator(".exercise-picker-backdrop").waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `artifacts/policy-release/picker-${theme}-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "إغلاق اختيار التمارين", exact: true }).click();
    }
  }
  await page.goto(base + "/contact");
  assert.equal(await page.locator('a[href="mailto:support@easycoach.space"]').count(), 0);
  await page.getByText(/البريد قيد التفعيل/).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS support dialog focus/Escape, exercise picker, 390/1440 light/dark, no horizontal overflow, inactive mailbox disclosed");
} finally { await browser.close(); }
