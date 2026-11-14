import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.TEST_BASE_URL;
assert(base && ["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Local fictional QA only");
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
  await page.goto(base + "/login"); await page.waitForLoadState("networkidle");
  await page.locator("#auth-email").fill("coach2@example.test");
  await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator('button[type="submit"]').click(); await page.waitForURL("**/coach");
  await page.goto(base + "/coach/clients"); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "استيراد ملف", exact: true }).click();
  const email = `design-import-${Date.now()}@example.test`;
  await page.locator("#import-file").setInputFiles({ name: "design.csv", mimeType: "text/csv", buffer: Buffer.from(`الاسم,الإيميل,الجوال\r\nمتدرب تحقق الاستيراد,${email},0501234567\r\n`) });
  await page.getByRole("button", { name: "قراءة ومعاينة", exact: true }).click();
  const apply = page.getByTestId("apply-full-import");
  await apply.waitFor(); await apply.click();
  await page.waitForFunction(async ({ base, email }) => {
    const response = await fetch(base + "/api/export");
    return response.ok && (await response.json()).clients.some(client => client.email === email);
  }, { base, email }, { timeout: 30000 });
  const workbook = await page.request.get(base + "/api/export?type=xlsx");
  assert.equal(workbook.status(), 200);
  const bytes = await workbook.body();
  assert.equal(bytes.subarray(0, 2).toString(), "PK", "XLSX must be a real ZIP workbook");
  await writeFile("artifacts/design-release/import-export.xlsx", bytes);
  console.log("PASS: CSV preview and import saved the trainee; Excel export produced a real workbook");
} finally { await browser.close(); }
