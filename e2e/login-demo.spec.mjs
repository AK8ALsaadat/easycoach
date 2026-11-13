import { expect, test } from "@playwright/test";

const demoLabel = "تجربة المنصة";

async function openSignedOutLogin(page, viewport) {
  await page.context().clearCookies();
  await page.setViewportSize(viewport);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login$/);
  return page.getByRole("link", { name: demoLabel, exact: true });
}

test("signed-out users can discover and keyboard-activate the demo link", async ({ page }, testInfo) => {
  const desktopLink = await openSignedOutLogin(page, { width: 1440, height: 1000 });
  await expect(desktopLink).toBeVisible();
  await expect(desktopLink).toHaveAttribute("href", "/demo");
  await page.screenshot({ path: testInfo.outputPath("login-desktop.png"), fullPage: true });

  const mobileLink = await openSignedOutLogin(page, { width: 390, height: 844 });
  await expect(mobileLink).toBeVisible();
  await expect(mobileLink).toBeInViewport();
  await expect(mobileLink).toHaveAttribute("href", "/demo");
  await page.screenshot({ path: testInfo.outputPath("login-mobile.png"), fullPage: true });

  for (let press = 0; press < 10; press += 1) {
    if (await mobileLink.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(mobileLink).toBeFocused();
  await expect(mobileLink).toHaveCSS("outline-style", "solid");
  await expect(mobileLink).toHaveCSS("outline-width", "3px");
  await page.screenshot({ path: testInfo.outputPath("login-mobile-focused.png"), fullPage: true });

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/demo$/);
});
