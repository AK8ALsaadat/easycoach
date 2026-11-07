import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3200";
const output = "artifacts/portal";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1512, height: 1000 },
  });
  const errors = [],
    photographs = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/exercises/")) photographs.push(request.url());
  });
  await page.goto(base + "/login");
  await page.locator("#auth-email").fill("coach@example.test");
  await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator("button[type=submit]").click();
  await page.waitForURL("**/coach");
  await page.locator(".performance-hero").waitFor();
  await page.screenshot({
    path: output + "/dashboard-desktop.png",
    fullPage: true,
  });

  await page.getByLabel("البحث في المتدربين").fill("غير موجود 12345");
  await page.locator(".portal-search button").click();
  await page.waitForURL(/\/coach\/clients\?q=/);
  assert.equal(
    await page.getByLabel("البحث عن عميل").inputValue(),
    "غير موجود 12345",
  );
  assert.equal(await page.locator("main tbody tr").count(), 0);

  await page.goto(base + "/coach/library");
  await page.locator(".movement-card").first().waitFor();
  assert.equal(
    await page.locator(".movement-card .exercise-pictogram").count(),
    18,
  );
  assert.equal(await page.locator(".movement-card img").count(), 0);
  await page.getByLabel("ابحث في التمارين").fill("Barbell Squat");
  await page
    .locator(".movement-card")
    .first()
    .getByRole("button")
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.locator("ol").getAttribute("dir"), "rtl");
  assert.match(await dialog.locator("ol").innerText(), /[\u0600-\u06ff]/);
  await page.screenshot({ path: output + "/exercise-arabic.png" });
  await page.keyboard.press("Tab");
  assert(await dialog.evaluate((el) => el.contains(document.activeElement)));
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  await page.getByLabel("ابحث في التمارين").fill("");
  await page.getByRole("button", { name: "التالي", exact: true }).click();
  await page.getByRole("button", { name: "السابق", exact: true }).click();
  await page.screenshot({
    path: output + "/library-desktop.png",
    fullPage: true,
  });

  for (const width of [360, 390, 768, 1280]) {
    await page.goto(base + "/coach");
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "Overflow at " + width,
    );
    if (width < 768) {
      assert(await page.locator(".mobile-roster").isVisible());
      await page
        .getByRole("button", { name: "فتح القائمة", exact: true })
        .click();
      assert(await page.locator(".portal-sidebar").isVisible());
      await page.keyboard.press("Escape");
      assert(!(await page.locator(".portal-sidebar").isVisible()));
      await page
        .getByRole("button", { name: "فتح القائمة", exact: true })
        .click();
      await page
        .locator(".portal-sidebar nav")
        .getByRole("link", { name: "مكتبة التدريب" })
        .click();
      await page.waitForURL("**/coach/library");
      assert(!(await page.locator(".portal-sidebar").isVisible()));
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "Library overflow at " + width,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/coach");
  await page.screenshot({
    path: output + "/dashboard-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(photographs, [], "An exercise photograph was requested");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: portal search, Arabic instructions, vector icons, keyboard dialogs, pagination, mobile navigation, and 4 responsive widths.",
  );
} finally {
  await browser.close();
}
