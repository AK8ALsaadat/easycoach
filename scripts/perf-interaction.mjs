import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
// Writes only to the isolated, locally seeded QA account.
const base = 'http://127.0.0.1:3200';
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-forwarded-for': `perf-${crypto.randomUUID()}` } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(base + '/login');
  await page.locator('#auth-email').fill('trainee@example.test');
  await page.locator('#auth-password').fill('CoachPreview!2026');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/me');
  await page.getByRole('tab', { name: 'المراسلات', exact: true }).click();
  await page.waitForLoadState('networkidle');
  const requests = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/me') requests.push({ method: request.method(), rsc: new URL(request.url()).searchParams.has('_rsc') }); });
  const marker = `perf-check-${Date.now()}`;
  const form = page.locator('[data-record-kind=message]');
  await form.locator('textarea').fill(marker);
  await form.getByRole('button', { name: 'إرسال', exact: true }).click();
  await page.locator('p').filter({ hasText: marker }).first().waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(await form.locator('textarea').inputValue(), '');
  if (process.argv[2] === 'after') assert.equal(requests.filter(request => request.method === 'GET' && request.rsc).length, 0, 'Saving must not fetch the private snapshot twice');
  const result = { environment: 'warmed development / synthetic local data', requests, updatedMessageVisible: true };
  fs.mkdirSync('artifacts/performance', { recursive: true });
  fs.writeFileSync(`artifacts/performance/interaction-${process.argv[2] ?? 'sample'}.json`, JSON.stringify(result, null, 2));
  console.log(result);
} finally { await browser.close(); }
