import { test, expect } from '@playwright/test';
import axe from 'axe-core';

test('visible labels match accessible names across sign-in and the exercise library', async ({ page }) => {
  await page.goto('/login');
  await page.addScriptTag({ content: axe.source });
  let result = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'rule', values: ['label-content-name-mismatch'] } })).violations);
  expect(result).toEqual([]);
  await page.getByRole('button', { name: 'EN — Switch to English' }).click();
  await expect(page.getByRole('button', { name: 'العربية — التبديل إلى العربية' })).toBeVisible();
  result = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'rule', values: ['label-content-name-mismatch'] } })).violations);
  expect(result).toEqual([]);
  await page.getByRole('button', { name: 'العربية — التبديل إلى العربية' }).click();
  await expect(page.getByRole('button', { name: 'EN — Switch to English' })).toBeVisible();
  await page.locator('#auth-email').fill('coach@example.test');
  await page.locator('#auth-password').fill('CoachPreview!2026');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/coach');
  await page.goto('/coach/library');
  await expect(page.locator('.picker-card-select').first()).toBeVisible();
  const exercise = page.locator('.picker-card-select').first();
  await exercise.click();
  await expect(exercise).toHaveAttribute('aria-pressed', 'true');
  await page.addScriptTag({ content: axe.source });
  result = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'rule', values: ['label-content-name-mismatch'] } })).violations);
  expect(result).toEqual([]);
});
