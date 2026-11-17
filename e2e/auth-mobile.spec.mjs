import { test, expect } from '@playwright/test';

test('registration starts clean and preserves a typed email when switching modes', async ({ page }) => {
  await page.goto('/login?register=1');
  await expect(page.locator('#auth-email')).toHaveValue('');
  await expect(page.locator('#auth-password')).toHaveValue('');
  await page.locator('#auth-email').fill('person@example.test');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).first().click();
  await expect(page.locator('#auth-email')).toHaveValue('person@example.test');
});

test('switching from local preview login does not carry demo credentials into signup', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.locator('#auth-password')).toHaveValue('CoachPreview!2026');
  await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).click();
  await expect(page.locator('#auth-email')).toHaveValue('');
  await expect(page.locator('#auth-password')).toHaveValue('');
});

test('public pages fit a narrow mobile viewport without runtime errors', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/', '/login', '/login?register=1', '/pricing', '/contact', '/privacy', '/terms']) {
    const response = await page.goto(path);
    expect(response.status(), path).toBeLessThan(400);
    await expect(page.locator('h1').first(), path).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
  await context.close();
});
