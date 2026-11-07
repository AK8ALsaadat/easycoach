import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3200";
const output = "artifacts/portal-v2";
await mkdir(output, { recursive: true });
const browserTemp = path.resolve(output, "browser-temp");
await mkdir(browserTemp, { recursive: true });
process.env.TEMP = browserTemp;
process.env.TMP = browserTemp;
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
  const anonymous = await browser.newContext();
  assert.equal(
    (
      await anonymous.request.get(
        base + "/api/exercise-media/Dumbbell_Flyes?kind=poster",
      )
    ).status(),
    404,
  );
  await page.goto(base + "/login");
  await page.locator("#auth-email").fill("coach@example.test");
  await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator("button[type=submit]").click();
  await page.waitForURL("**/coach");
  const before = await (await page.request.get(base + "/api/export")).json();
  await page.locator(".performance-hero").waitFor();
  await page.screenshot({ path: output + "/dashboard-desktop.png" });
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
  assert.equal(await page.locator(".movement-card").count(), 24);
  assert.equal(await page.locator(".exercise-pictogram").count(), 0);
  await page
    .locator(".movement-card [data-exercise-id=Dumbbell_Flyes] img")
    .waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".movement-card img")].every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  await page.screenshot({ path: output + "/library-desktop.png" });
  const poster = await page.request.get(
    base + "/api/exercise-media/Dumbbell_Flyes?kind=poster",
  );
  assert.equal(poster.status(), 200);
  assert(poster.headers()["content-type"].includes("image/webp"));
  assert(poster.headers()["cache-control"].includes("private"));
  const partial = await page.request.get(
    base + "/api/exercise-media/Dumbbell_Flyes?kind=video",
    { headers: { Range: "bytes=0-1023" } },
  );
  assert.equal(partial.status(), 206);
  assert.equal((await partial.body()).length, 1024);
  assert.equal(
    (
      await page.request.get(
        base + "/api/exercise-media/Incline_Dumbbell_Flyes?kind=poster",
      )
    ).status(),
    404,
  );
  await page.getByLabel("بصور توضيحية فقط").check();
  assert.equal(await page.locator(".movement-card").count(), 2);
  await page.getByLabel("العضلة", { exact: true }).selectOption("chest");
  assert.equal(await page.locator(".movement-card").count(), 1);
  await page.getByLabel("المعدات", { exact: true }).selectOption("barbell");
  assert.equal(await page.locator(".movement-card").count(), 0);
  await page.getByRole("button", { name: "عرض جميع التمارين" }).click();
  await page.getByLabel("ابحث في التمارين").fill("Barbell Squat");
  await page.getByLabel("المعدات", { exact: true }).selectOption("barbell");
  const count = await page.locator(".movement-card").count();
  assert(count > 0);
  await page.getByRole("tab", { name: "قوالب البرامج", exact: true }).click();
  await page.getByRole("tab", { name: "تماريني الخاصة", exact: true }).click();
  await page
    .getByRole("tab", { name: "دليل التمارين · 876", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("ابحث في التمارين").inputValue(),
    "Barbell Squat",
  );
  assert.equal(
    await page.getByLabel("المعدات", { exact: true }).inputValue(),
    "barbell",
  );
  assert.equal(await page.locator(".movement-card").count(), count);
  await page.locator(".movement-open").first().click();
  let dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.locator("ol").getAttribute("dir"), "rtl");
  assert.match(await dialog.locator("ol").innerText(), /[\u0600-\u06ff]/);
  assert.equal(
    await dialog.locator("[data-media-status=unavailable]").count(),
    1,
  );
  await page.keyboard.press("Tab");
  assert(await dialog.evaluate((el) => el.contains(document.activeElement)));
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "مسح الفلاتر", exact: true }).click();
  await page.getByRole("button", { name: "التالي", exact: true }).click();
  assert.equal(
    await page.locator(".movement-card [data-media-status=verified]").count(),
    0,
  );
  await page.getByRole("button", { name: "السابق", exact: true }).click();
  await page
    .locator(".movement-card")
    .filter({ has: page.locator("[data-exercise-id=Dumbbell_Flyes]") })
    .locator(".movement-open")
    .click();
  dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "شاهد أداء الحركة" }).click();
  await dialog.locator("video").waitFor();
  await page.waitForFunction(
    () => document.querySelector(".exercise-detail video")?.readyState >= 2,
  );
  await page.screenshot({ path: output + "/exercise-anatomy.png" });
  await page.keyboard.press("Escape");
  await page
    .locator(".movement-card")
    .filter({ has: page.locator('[data-exercise-id="Dumbbell_Flyes"]') })
    .getByRole("button", { name: "برنامج جديد", exact: true })
    .click();
  const seededName = await page.locator("#plan-name").inputValue();
  assert(seededName.includes("تفتيح الصدر"));
  const seededExercise = await page
    .getByRole("textbox", { name: "اسم التمرين 1", exact: true })
    .inputValue();
  await page
    .getByRole("tab", { name: "دليل التمارين · 876", exact: true })
    .click();
  await page.getByRole("tab", { name: "قوالب البرامج", exact: true }).click();
  assert.equal(await page.locator("#plan-name").inputValue(), seededName);
  assert.equal(
    await page
      .getByRole("textbox", { name: "اسم التمرين 1", exact: true })
      .inputValue(),
    seededExercise,
  );
  await page
    .getByRole("tab", { name: "دليل التمارين · 876", exact: true })
    .click();
  const widths = [360, 390, 768, 1280, 1920];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/coach",
      "/coach/library",
      "/coach/clients",
      "/coach/finance",
      "/coach/settings",
    ]) {
      await page.goto(base + route);
      await page.locator("main h1").waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "Overflow " + route + " @" + width,
      );
    }
    await page.goto(base + "/coach/library");
    const text = await page
      .locator(".movement-copy h3")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    assert(text >= 15);
    if (width < 768) {
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
        .getByRole("link", { name: "نظرة عامة", exact: true })
        .click();
      await page.waitForURL("**/coach");
      assert(!(await page.locator(".portal-sidebar").isVisible()));
    }
    await page.goto(base + "/coach/library");
    if (width === 390 || width === 768 || width === 1920)
      await page.screenshot({ path: output + "/library-" + width + ".png" });
  }
  await page.setViewportSize({ width: 1512, height: 1000 });
  await page.goto(base + "/coach/library");
  await page.route("**/api/exercise-media/Pullups?kind=poster", (route) =>
    route.abort(),
  );
  await page.reload();
  await page
    .locator("[data-exercise-id=Pullups][data-media-status=unavailable]")
    .waitFor();
  await page.unroute("**/api/exercise-media/Pullups?kind=poster");
  const after = await (await page.request.get(base + "/api/export")).json();
  for (const key of [
    "clients",
    "programs",
    "templates",
    "exercises",
    "subscriptions",
    "payments",
    "weights",
  ])
    assert.deepEqual(
      after[key],
      before[key],
      "Read-only navigation changed " + key,
    );
  assert.deepEqual(photographs, []);
  assert.deepEqual(errors, []);
  await writeFile(
    output + "/results.json",
    JSON.stringify(
      {
        passed: true,
        widths,
        checks: [
          "RTL library layout",
          "exact licensed media",
          "neutral unavailable state",
          "image load failure",
          "private anonymous denial",
          "video byte ranges",
          "Arabic and English search",
          "combined filters",
          "tab state preservation",
          "pagination",
          "Arabic movement details",
          "keyboard navigation",
          "no data changes",
          "five pages at five viewport widths",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: anatomy media, private access, search/filters/tabs, neutral fallback, no data changes, and 5 pages at 5 screen widths.",
  );
} finally {
  await browser.close();
}
