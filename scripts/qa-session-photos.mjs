import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3200';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await chromium.launch({headless: true, ...(process.platform === 'win32' ? {channel: 'msedge'} : {})});
const context = await browser.newContext({viewport: {width: 390, height: 844}});
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(180000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function login(email) {
  await page.goto(base + '/login');
  await page.waitForLoadState('networkidle');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill('CoachPreview!2026');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(email.startsWith('trainee') ? '**/me' : '**/coach');
  await page.waitForLoadState('networkidle');
}
async function logout() {
  await context.request.post(base + '/logout', {headers: {origin: base}});
}
try {
  await login('coach@example.test');
  const a = await (await context.request.get(base + '/api/export')).json();
  await logout();
  await login('coach2@example.test');
  const b = await (await context.request.get(base + '/api/export')).json();
  assert.notEqual(a.profile.id, b.profile.id);
  for (const route of ['/coach', '/coach/clients', '/coach/library', '/coach/finance', '/coach/settings']) {
    await page.goto(base + route);
    assert.equal((await (await context.request.get(base + '/api/session')).json()).userId, b.profile.id);
    const snapshot = await (await context.request.get(base + '/api/export')).json();
    assert(snapshot.clients.every(client => !a.clients.some(old => old.id === client.id)));
    assert(!(await page.locator('aside').textContent()).includes(a.profile.name));
  }
  console.log('PASS: A then B in one browser, all five coach routes stay on B');
  await logout();
  await login('trainee@example.test');
  const later = page.getByRole('button', {name: 'مو الحين', exact: true});
  await later.waitFor({state:'visible', timeout:5000}).then(() => later.click()).catch(error => {
    if (error.name !== 'TimeoutError') throw error;
  });
  await page.getByRole('tab', {name:'صور التقدم', exact: true}).click();
  const enable = page.getByRole('button', {name:'تفعيل صور التقدم', exact: true});
  await enable.or(page.locator('input[id^="progress-photo-"]').first()).waitFor({state:'attached'});
  if (await enable.isVisible()) {
    await enable.click();
    await page.getByRole('button', {name:'موافق، أبي أرفع صور', exact: true}).click();
  }
  const inputs = page.locator('input[id^="progress-photo-"]');
  await inputs.first().waitFor({state:'attached'});
  // Slow the older selection to force its result to arrive after its replacement.
  await page.evaluate(() => {
    const original = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (...args) => {
      if (args[0]?.name === 'slow.png') await new Promise(resolve => setTimeout(resolve, 1200));
      return original(...args);
    };
  });
  const buffer = await sharp({create:{width:640,height:800,channels:3,background:'#276779'}}).png().toBuffer();
  const photo = name => ({name, mimeType:'image/png', buffer});
  await inputs.nth(0).setInputFiles(photo('slow.png'));
  await inputs.nth(1).setInputFiles(photo('back.png'));
  await inputs.nth(2).setInputFiles(photo('side.png'));
  await inputs.nth(0).setInputFiles(photo('replacement.png'));
  await page.getByAltText('معاينة زاوية أمام', {exact:true}).waitFor();
  await page.getByAltText('معاينة زاوية خلف', {exact:true}).waitFor();
  await page.getByAltText('معاينة زاوية جانب', {exact:true}).waitFor();
  await page.waitForTimeout(1500);
  assert(await page.getByText('replacement.webp', {exact:true}).isVisible());
  assert.equal(await page.getByText('slow.webp', {exact:true}).count(), 0);
  console.log('PASS: three quick photos and replacement during processing');
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({colorScheme});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  // Losing the cookie must leave the photo previews mounted behind the sign-in modal.
  await context.clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('dialog').filter({hasText:'انتهت جلستك'}).waitFor();
  assert.equal(await page.getByAltText('معاينة زاوية أمام', {exact:true}).count(), 1);
  assert(new URL(page.url()).pathname === '/me');
  assert.deepEqual(errors, []);
  console.log('PASS: 390px light/dark without horizontal scroll; expired session preserves page and previews');
} finally { await browser.close(); }
