import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
const base = "http://127.0.0.1:3200",
  root = path.resolve("artifacts/demo");
await fs.mkdir(root, { recursive: true });
process.env.TEMP = root;
process.env.TMP = root;
const browser = await chromium.launch({
    headless: true,
    ...(process.platform === "win32" ? { channel: "msedge" } : {}),
  }),
  errors = [];
const snapshot = async (page) =>
  (await page.request.get(base + "/api/export")).json();
try {
  const owner = await browser.newPage();
  await owner.goto(base + "/login");
  await owner.locator("#auth-email").fill("coach@example.test");
  await owner.locator("#auth-password").fill("CoachPreview!2026");
  await owner.locator('button[type="submit"]').click();
  await owner.waitForURL("**/coach");
  const before = await snapshot(owner);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/demo");
  assert.equal(await page.locator("#demo-username").inputValue(), "test");
  await page.locator("#demo-password").fill("wrong");
  await page.locator('button[type="submit"]').click();
  await page.getByRole("alert").waitFor();
  assert.ok(page.url().endsWith("/demo"));
  await page.locator("#demo-password").fill("test");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/coach");
  await page
    .getByRole("status")
    .filter({ hasText: "حساب تجريبي عام" })
    .waitFor();
  const demo = await snapshot(page);
  assert.equal(demo.demo, true);
  assert.equal(demo.profile.name, "test");
  assert.notEqual(demo.profile.id, before.profile.id);
  assert.ok(demo.clients.every((c) => c.coach_id === demo.profile.id));
  assert.ok(
    !demo.clients.some((c) =>
      before.clients.some((original) => original.id === c.id),
    ),
  );
  await page.screenshot({
    path: root + "/demo-coach-mobile.png",
    fullPage: true,
  });
  const email = `demo-browser-${Date.now()}@example.test`;
  await page.goto(base + "/coach/clients?add=1");
  await page.locator('main form input[name="email"]').fill(email);
  await page
    .locator('main form input[name="name"]')
    .fill("عميل اختبار الحساب التجريبي");
  await page.locator('main form button[type="submit"]').click();
  await page.waitForURL(/\/coach\/clients\/[a-f0-9-]+$/);
  await page.reload();
  assert.ok((await snapshot(page)).clients.some((c) => c.email === email));
  assert.equal((await snapshot(owner)).clients.length, before.clients.length);
  const privateClient = before.clients[0];
  await page.goto(base + "/coach/clients/" + privateClient.id);
  assert.ok(
    !(await page.locator("main").innerText()).includes(privateClient.email),
  );
  await page.goto(base + "/demo");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.waitForFunction(() => document.documentElement.lang === "en");
  assert.match(await page.locator("h1").innerText(), /Demo account/);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({ path: root + "/demo-login-en.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: test/test demo login, wrong-password rejection, tenant isolation, real persistent CRUD, shared-demo banner, mobile and English",
  );
} finally {
  await browser.close();
}
