import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3218";
assert.equal(new URL(base).hostname, "127.0.0.1");
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  page.setDefaultTimeout(60000);
  await page.goto(base + "/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "جديد هنا؟ أنشئ حسابك", exact: true }).click();
  const password = page.locator("#auth-password");
  const confirmation = page.locator("#auth-password-confirmation");
  const submit = page.getByRole("button", { name: "إنشاء حساب", exact: true });
  const meter = page.getByRole("meter", { name: "قوة كلمة المرور" });
  assert(await submit.isDisabled());
  await password.fill("abcdefgh");
  assert.equal(await meter.getAttribute("aria-valuenow"), "1");
  await confirmation.fill("abcdefgh");
  assert(await submit.isDisabled());
  await password.fill("Abcdefg!");
  await confirmation.fill("Abcdefg?");
  assert(await submit.isDisabled());
  await page.getByText("كلمتا المرور غير متطابقتين", { exact: true }).waitFor();
  await confirmation.fill("Abcdefg!");
  assert(await submit.isEnabled());
  assert.equal(await meter.getAttribute("aria-valuenow"), "2");
  await password.fill("Abcdefghijk1234!");
  assert.equal(await meter.getAttribute("aria-valuenow"), "4");
  assert(await submit.isDisabled());
  await confirmation.fill("Abcdefghijk1234!");
  assert(await submit.isEnabled());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // Never submit a real account or send an email: server action acceptance is
  // tested separately with a mocked Auth provider.
  await page.screenshot({ path: "artifacts/registration-password-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "عندك حساب؟ ادخل", exact: true }).click();
  assert.equal(await confirmation.count(), 0);
  assert(await submit.count() === 0);
  assert.equal(await password.inputValue(), "");
  console.log("PASS: mobile registration strength, required policy, exact confirmation, submit gating and login switching; no signup request sent");
} finally { await browser.close(); }
