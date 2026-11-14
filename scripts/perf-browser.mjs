import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3201';
if (!['127.0.0.1', 'easycoach.space'].includes(new URL(base).hostname)) throw Error('Unexpected measurement host');
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
const results = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    if (mobile) {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await page.addInitScript(() => {
      window.__perf = { lcp: 0, cls: 0 };
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__perf.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    for (const visit of ['cold', 'warm']) {
      const response = await page.goto(base + '/login', { waitUntil: 'networkidle', timeout: 90000 });
      await page.locator('#auth-email').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const value = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        return { ttfb: nav.responseStart, dom: nav.domContentLoadedEventEnd, ...window.__perf, requests: resources.length, transfer: resources.reduce((sum, r) => sum + r.transferSize, 0), js: resources.filter(r => r.name.includes('.js')).reduce((sum, r) => sum + r.encodedBodySize, 0) };
      });
      results.push({ base, mobile, visit, status: response.status(), cacheControl: response.headers()['cache-control'], ...value });
    }
    await context.close();
  }
} finally { await browser.close(); }
fs.mkdirSync('artifacts/performance', { recursive: true });
fs.writeFileSync(`artifacts/performance/browser-${process.argv[2] ?? 'sample'}.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
