// Anonymous production acceptance. TikTok requests are intercepted; no signups or charges.
import { chromium, webkit, devices } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import assert from "node:assert/strict";

const dir = "artifacts/pricing";
await mkdir(dir, { recursive: true });
const port = await new Promise(resolve => {
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(() => resolve(port)); });
});
const base = `http://127.0.0.1:${port}`;
const log = createWriteStream(`${dir}/server.log`);
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  env: { ...process.env, NODE_ENV: "production", BILLING_ENABLED: "false", APP_URL: base, LOCAL_DB_PATH: "" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.pipe(log); server.stderr.pipe(log);
const results = [], errors = [];
let chrome, safari;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw Error(`Production preview exited; see ${dir}/server.log`);
    try { if ((await fetch(base + "/pricing", { redirect: "manual" })).status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Pricing must return HTTP 200 without a redirect when billing is disabled");
  chrome = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
  safari = await webkit.launch({ headless: true });
  const profiles = [
    { name: "ios-webkit", browser: safari, options: devices["iPhone 13"] },
    { name: "android-chromium", browser: chrome, options: devices["Pixel 7"] },
    { name: "desktop-chromium", browser: chrome, options: { viewport: { width: 1440, height: 1000 } } },
  ];
  const params = new URLSearchParams({ utm_source: "tiktok", utm_campaign: "حملة + تسجيل", utm_medium: "paid_social", utm_id: "ad-123", utm_content: "فيديو 1", ttclid: "qa_pricing_123", custom: "a+b & c" });
  params.append("utm_campaign", "second campaign"); params.append("empty", "");
  for (const profile of profiles) for (const theme of ["light", "dark"]) {
    const context = await profile.browser.newContext({ ...profile.options, reducedMotion: "reduce", serviceWorkers: "block" });
    await context.addCookies([{ name: "ec_theme", value: theme, url: base }]);
    await context.route("https://**.tiktok.com/**", route => route.fulfill({ status: 200, contentType: "application/javascript", body: "/* QA: TikTok network blocked */" }));
    if (profile.name === "desktop-chromium") await context.addInitScript({ path: createRequire(import.meta.url).resolve("axe-core/axe.min.js") });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on("pageerror", error => errors.push(`${profile.name}: ${error.message}`));
    const response = await page.goto(`${base}/pricing?${params}`);
    assert.equal(response.status(), 200);
    assert.equal(new URL(page.url()).pathname, "/pricing");
    await page.getByRole("heading", { name: "خطة إيزي كوتش المجانية", exact: true }).waitFor();
    const cta = page.getByRole("link", { name: "ابدأ مجاناً", exact: true });
    assert.equal(await cta.count(), 1);
    assert.equal(await page.locator("main").getAttribute("dir"), "rtl");
    assert.equal(await page.locator("h1").count(), 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert((await cta.boundingBox()).height >= 44);
    await page.waitForFunction(() => window.__ecTikTokLoaded && (window.ttq ?? []).filter(item => Array.isArray(item) && item[0] === "track" && item[1] === "ViewContent").length === 1);
    const count = kind => page.evaluate(kind => (window.ttq ?? []).filter(item => Array.isArray(item) && item[0] === kind).length, kind);
    assert.equal(await count("page"), 1, "One initial PageView");
    const pricingDocument = await page.evaluate(() => performance.timeOrigin);
    assert.equal(await page.locator('script[src*="analytics.tiktok.com/i18n/pixel/events.js"]').count(), 1);
    if (profile.name === "desktop-chromium") {
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(issue => ({ id: issue.id, nodes: issue.nodes.map(node => node.target) })));
      assert.deepEqual(violations, [], "Pricing accessibility");
    }
    await page.screenshot({ path: `${dir}/${profile.name}-${theme}.png`, fullPage: true });
    await cta.click(); await page.waitForURL(url => url.pathname === "/login");
    const landed = new URL(page.url());
    assert.equal(landed.searchParams.get("register"), "1");
    for (const key of new Set(params.keys())) assert.deepEqual(landed.searchParams.getAll(key), params.getAll(key), `Lost query parameter: ${key}`);
    await page.locator("#auth-name").waitFor();
    await page.waitForFunction(() => window.__ecTikTokLoaded);
    const sameDocument = pricingDocument === await page.evaluate(() => performance.timeOrigin);
    await page.waitForFunction(expected => (window.ttq ?? []).filter(item => Array.isArray(item) && item[0] === "page").length === expected, sameDocument ? 2 : 1);
    assert.equal(await page.evaluate(() => (window.ttq ?? []).filter(item => Array.isArray(item) && item[0] === "track" && ["CompleteRegistration", "Subscribe"].includes(item[1])).length), 0);
    await page.goBack(); await page.waitForURL(url => url.pathname === "/pricing");
    await page.waitForFunction(expected => (window.ttq ?? []).filter(item => Array.isArray(item) && item[0] === "track" && item[1] === "ViewContent").length >= expected, sameDocument ? 2 : 1);
    results.push(`${profile.name}/${theme}: HTTP 200, Arabic RTL, signup + all query values, PageView/ViewContent, back navigation`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${dir}/results.json`, JSON.stringify({ passed: true, results, errors, scope: "Local production build. WebKit iPhone and Chromium Android emulation, not physical devices. TikTok network blocked." }, null, 2));
  console.log("PASS\n" + results.join("\n"));
} catch (error) {
  await writeFile(`${dir}/results.json`, JSON.stringify({ passed: false, results, errors, error: String(error) }, null, 2));
  throw error;
} finally {
  await chrome?.close(); await safari?.close();
  if (server.pid) try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    else server.kill();
  } catch {}
  log.end();
}
