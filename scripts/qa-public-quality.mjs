// Public production pages only. No account, payment or external-message actions.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3220";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const english = JSON.parse(await readFile("lib/locales/en.json", "utf8"));
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
const errors = [];
try {
  await mkdir("artifacts/quality-release", { recursive: true });
  for (const language of ["ar", "en"]) for (const width of [360, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await context.addCookies([{ name: "ec_language", value: language, url: base }, { name: "ec_theme", value: "light", url: base }]);
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "/login");
    assert.equal(await page.locator("html").getAttribute("lang"), language);
    assert.equal(await page.locator("html").getAttribute("dir"), language === "en" ? "ltr" : "rtl");
    await page.locator("form").getByRole("button", { name: language === "en" ? english["الدخول إلى مساحتك"] : "الدخول إلى مساحتك", exact: true }).waitFor();
    for (const theme of ["dark", "light"]) {
      await page.locator(".theme-toggle").click();
      assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
      assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"), theme === "dark" ? "#08181f" : "#f0f5f4");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `artifacts/quality-release/production-login-${language}-${width}-${theme}.png`, fullPage: true });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("PASS: Arabic/English production login, RTL/LTR, 360/1440px, live light/dark theme and browser chrome, no overflow or runtime errors");
} finally { await browser.close(); }
