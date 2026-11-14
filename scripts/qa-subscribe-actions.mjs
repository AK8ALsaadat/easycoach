import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.TEST_BASE_URL;
assert(base && new URL(base).hostname === "127.0.0.1", "Only an isolated local trial fixture");
await mkdir("artifacts/subscribe-fix", { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(120000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/login"); await page.waitForLoadState("networkidle");
  await page.locator("#auth-email").fill("trial@example.test"); await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator('button[type="submit"]').click(); await page.waitForURL("**/coach");
  await page.goto(base + "/start?plan=starter");
  await page.locator(".plan-card.is-featured").getByRole("link", { name: "ابدأ 14 يومًا مجانًا", exact: true }).click();
  await page.waitForURL("**/subscription/confirm?plan=starter"); await page.waitForLoadState("networkidle");
  const button = page.getByRole("button", { name: "ابدأ 14 يومًا مجانًا الآن", exact: true });
  let posts = 0;
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/subscription/confirm") posts++; });
  await button.click();
  await page.getByRole("alert").filter({ hasText: "لبدء التجربة، وافق" }).waitFor();
  assert.equal(posts, 0, "Unchecked consent must not send a trial request");
  assert(await page.locator('[name="terms_acceptance"]').evaluate(input => input === document.activeElement));
  await page.screenshot({ path: "artifacts/subscribe-fix/visible-consent-error.png", fullPage: true });
  await page.locator('[name="terms_acceptance"]').check();
  let release, observed;
  const held = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { observed = resolve; });
  await page.route(url => url.pathname === "/subscription/confirm", async route => {
    if (route.request().method() !== "POST") return route.continue();
    observed(); await held; await route.continue();
  });
  const click = button.click();
  await requested;
  try {
    const pending = page.getByRole("button", { name: "جارٍ بدء تجربتك المجانية…", exact: true });
    await pending.waitFor(); assert(await pending.isDisabled());
    assert.equal(posts, 1);
    await page.screenshot({ path: "artifacts/subscribe-fix/trial-pending.png", fullPage: true });
  } finally { release(); }
  await click; await page.waitForURL("**/coach?trial=started");
  await page.getByText("بدأت تجربتك المجانية", { exact: false }).first().waitFor();
  await page.goto(base + "/start?plan=starter"); await page.waitForURL("**/subscription");
  await page.getByRole("heading", { name: "تجربتك المجانية جارية", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: unchecked consent is visible with no request; pending state blocks duplicates; selected trial starts once; existing trial opens its subscription details");
} finally { await browser.close(); }
