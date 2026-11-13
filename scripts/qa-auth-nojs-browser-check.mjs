import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3217";
assert.equal(new URL(base).hostname, "127.0.0.1");
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
try {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(base + "/login");
  const request = page.waitForRequest(r => r.isNavigationRequest() && r.frame() === page.mainFrame());
  await page.locator('button[type="submit"]').click();
  const submitted = await request;
  assert.equal(submitted.method(), "POST", "Credentials must never be submitted via GET before hydration");
  assert.equal(new URL(submitted.url()).searchParams.has("password"), false);
  console.log("PASS: no-JavaScript credential submission uses POST and never puts passwords in the URL");
} finally { await browser.close(); }
