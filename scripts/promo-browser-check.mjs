import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const credentials = JSON.parse(await readFile("seed-credentials.json", "utf8"));
const account = credentials.accounts[0];
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3200";
const output = path.resolve(".local-dev/promo/browser");
await mkdir(output, { recursive: true });
process.env.TEMP = output; process.env.TMP = output;
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
const errors = [], checks = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(30000);
page.on("pageerror", error => errors.push(error.message));
try {
  await page.goto(base + "/login");
  await page.locator("#auth-email").fill(account.email);
  await page.locator("#auth-password").fill(account.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/me");
  await page.locator("h1").waitFor();
  const consent = page.getByRole("dialog", { name: "قبل ما ترفع صور التقدم" });
  await consent.waitFor({ timeout: 3000 }).catch(() => {});
  if (await consent.isVisible()) await consent.getByRole("button", { name: "مو الحين", exact: true }).click();
  const exportResponse = await page.request.get(base + "/api/export");
  assert.equal(exportResponse.status(), 200);
  const saved = await exportResponse.json();
  assert.deepEqual(saved.clients.map(c => c.id), [account.clientId]);
  assert(saved.weights.length >= 35);
  assert(saved.management.records.some(r => r.kind === "measurement"));
  assert(saved.management.records.some(r => r.kind === "workout_log"));
  assert(saved.management.records.some(r => r.kind === "checkin"));
  assert(saved.programs.some(p => p.content.nutrition.calories > 0 && p.content.days.length >= 3));
  const body = await page.locator("body").innerText();
  for (const forbidden of ["حساب تجريبي عام", "جميع البيانات هنا وهمية", "معاينة محلية", "CoachPreview!2026"])
    assert(!body.includes(forbidden), "Preview banner leaked into real seeded account");
  checks.push("Real hosted Auth login, isolated persisted history, workout plan and nutrition, no public-demo banner");
  await page.screenshot({ path: output + "/trainee-desktop.png", fullPage: true });
  for (const name of ["القياسات والتقدم", "سجل التدريب", "المراجعات الأسبوعية", "الماكروز الفعلية", "المراسلات", "صور التقدم"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    assert(await page.locator("h2").count());
    assert.equal(await page.locator(".application-error").count(), 0);
    checks.push("Opened " + name);
  }
  await page.getByRole("tab", { name: "القياسات والتقدم", exact: true }).click();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: output + `/trainee-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  await writeFile(output + "/result.json", JSON.stringify({ project: credentials.project, base, checks, errors, actualHostedData: true, noDataWrites: true }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors: errors.length, hostedData: true, desktopAndMobile: true }, null, 2));
} catch (error) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
