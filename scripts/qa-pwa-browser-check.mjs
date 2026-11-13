import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3217";
assert.equal(new URL(base).hostname, "127.0.0.1");
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
try {
  const context = await browser.newContext();
  context.setDefaultTimeout(60000);
  const page = await context.newPage();
  await page.goto(base + "/login");
  await page.locator("#auth-email").fill("trainee@example.test");
  await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/me");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js?v=qa-session-isolation");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const plan = () => page.evaluate(async () => {
    const response = await fetch("/api/offline-plan");
    return { status: response.status, body: await response.json() };
  });
  const online = await plan();
  assert.equal(online.status, 200);
  assert(online.body.plans.length > 0);
  await context.setOffline(true);
  assert.equal((await plan()).status, 200);
  await context.setOffline(false);
  await page.goto(base + "/login");
  await context.setOffline(true);
  const afterSwitch = await plan();
  assert.equal(afterSwitch.status, 503);
  assert.deepEqual(afterSwitch.body.plans, []);
  console.log("PASS: actual browser service worker serves the trainee plan offline, then removes it on direct login navigation");
} finally { await browser.close(); }
