import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3200";
const root = path.resolve("artifacts/studio");
await mkdir(root, { recursive: true });
process.env.TEMP = root;
process.env.TMP = root;
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
const errors = [];
const coach = await browser.newContext({
  viewport: { width: 1512, height: 1000 },
});
const page = await coach.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const snap = async () => {
  const r = await page.request.get(base + "/api/export");
  assert.equal(r.status(), 200);
  return r.json();
};
async function until(fn, message) {
  for (let i = 0; i < 60; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error(message);
}
try {
  await page.goto(base + "/login");
  await page.locator("#auth-email").fill("coach@example.test");
  await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator("button[type=submit]").click();
  await page.waitForURL("**/coach");
  await page.locator(".performance-hero").waitFor();
  await page.screenshot({
    path: root + "/dashboard-desktop.png",
    fullPage: true,
  });
  const video = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext("2d");
        const stream = canvas.captureStream(10);
        const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
        const chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const bytes = new Uint8Array(
            await new Blob(chunks, { type: "video/webm" }).arrayBuffer(),
          );
          let s = "";
          for (const b of bytes) s += String.fromCharCode(b);
          resolve(btoa(s));
        };
        rec.start();
        ctx.fillStyle = "#181b18";
        ctx.fillRect(0, 0, 320, 180);
        ctx.fillStyle = "#ff5a24";
        ctx.fillRect(60, 70, 200, 30);
        setTimeout(() => rec.stop(), 700);
      }),
  );
  await writeFile(root + "/exercise.webm", Buffer.from(video, "base64"));
  await page.goto(base + "/coach/clients?add=1");
  const form = page.locator("main form");
  await form.locator("input[name=name]").fill("متدرب استوديو " + Date.now());
  await form
    .locator("input[name=email]")
    .fill("studio-ui-" + Date.now() + "@example.test");
  await form.locator("button[type=submit]").click();
  await page.waitForURL(/\/coach\/clients\/[a-f0-9-]+$/);
  const cid = page.url().split("/").at(-1);
  await page.locator("#plan-name").fill("قوة / أربعة أسابيع");
  await page.getByRole("button", { name: "مكتبة الحركات · 876" }).click();
  await page.getByLabel("ابحث في التمارين").fill("Barbell Squat");
  await page
    .locator(".movement-card")
    .first()
    .getByRole("button", { name: "للجدول" })
    .click();
  await page.getByLabel("ابحث في التمارين").fill("Dumbbell Flyes");
  await page
    .locator(".movement-card")
    .first()
    .getByRole("button", { name: "للجدول" })
    .click();
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(root + "/exercise.webm");
  await page.getByText("تم إرفاق الفيديو", { exact: true }).first().waitFor();
  await page
    .getByRole("button", { name: "التغذية والأهداف", exact: true })
    .click();
  // Calories follow the macros by default; switch to manual to type them.
  const caloriesSwitch = page.getByRole("switch", { name: "احسب السعرات تلقائيًا من الماكروز" });
  if ((await caloriesSwitch.getAttribute("aria-checked")) === "true") await caloriesSwitch.click();
  await page.locator("#nutrition-calories").fill("2400");
  await page.locator("#nutrition-protein").fill("160");
  await page.locator("#nutrition-carbs").fill("260");
  await page.locator("#nutrition-fat").fill("80");
  await page.getByRole("button", { name: "وجبة", exact: true }).click();
  await page
    .getByLabel("مكونات الوجبة 1")
    .fill("شوفان وحليب وموز · مثال اصطناعي");
  await page.getByLabel("سعرات الوجبة 1").fill("500");
  await page.getByRole("button", { name: "نشر للمتدرب", exact: true }).click();
  await until(async () => {
    const s = await snap();
    return s.programs.some(
      (p) =>
        p.client_id === cid &&
        p.published_at &&
        p.content.nutrition.meals?.length,
    );
  }, "Meal/video publication failed");
  await page
    .getByRole("button", { name: "تفعيل رابط العميل", exact: true })
    .click();
  await page.getByLabel("رابط العميل الخاص").waitFor();
  const portalUrl = await page.getByLabel("رابط العميل الخاص").inputValue();
  const pin = await page.locator(".portal-share strong").innerText();
  const anon = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const portal = await anon.newPage();
  portal.on("pageerror", (e) => errors.push(e.message));
  await portal.goto(portalUrl);
  await portal.getByLabel("رمز دخول العميل").fill(pin);
  await portal.getByRole("button", { name: "افتح جدولي" }).click();
  await portal.getByText("شوفان وحليب وموز · مثال اصطناعي").waitFor();
  const anatomy = portal.locator('[data-exercise-id="Dumbbell_Flyes"] img');
  await anatomy.waitFor();
  const anatomyUrl = new URL(await anatomy.getAttribute("src"), base);
  assert.equal((await portal.request.get(anatomyUrl.href)).status(), 200);
  assert.equal(
    (await (await browser.newContext()).request.get(anatomyUrl.href)).status(),
    404,
  );
  const unrelatedAnatomyUrl = new URL(anatomyUrl);
  unrelatedAnatomyUrl.pathname = "/api/exercise-media/Pullups";
  assert.equal(
    (await portal.request.get(unrelatedAnatomyUrl.href)).status(),
    404,
  );
  await portal.getByLabel("الوزن بالكيلوجرام").fill("82.4");
  await portal.getByRole("button", { name: "تسجيل", exact: true }).click();
  await portal.getByText("تم حفظ الوزن", { exact: true }).waitFor();
  await portal.getByLabel("الوزن بالكيلوجرام").fill("82.1");
  await portal
    .getByRole("button", { name: "تصحيح الوزن", exact: true })
    .click();
  await until(
    async () =>
      (await snap()).weights.filter((w) => w.client_id === cid).length === 1,
    "Weight upsert failed",
  );
  const src = await portal.locator("video").first().getAttribute("src");
  const media = await portal.request.get(new URL(src, base).href);
  assert.equal(media.status(), 200);
  assert(media.headers()["content-type"].includes("video/"));
  const leaked = await (
    await browser.newContext()
  ).request.get(new URL(src, base).href);
  assert.equal(leaked.status(), 404);
  await portal.screenshot({
    path: root + "/portal-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await portal.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Portal mobile overflow",
  );
  await page
    .getByRole("button", { name: "البرنامج التدريبي", exact: true })
    .click();
  await page
    .getByRole("button", { name: "من الجوال · QR", exact: true })
    .first()
    .click();
  await page.getByRole("dialog", { name: "رفع من الجوال" }).waitFor();
  const phoneUrl = await page
    .getByRole("link", { name: "افتح رابط الرفع" })
    .getAttribute("href");
  const phone = await anon.newPage();
  await phone.goto(phoneUrl);
  await phone
    .locator("input[type=file]")
    .setInputFiles(root + "/exercise.webm");
  await phone.getByRole("heading", { name: "وصل الفيديو." }).waitFor();
  await page
    .getByRole("dialog", { name: "رفع من الجوال" })
    .waitFor({ state: "hidden", timeout: 15000 });
  await page.screenshot({
    path: root + "/program-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "نشر للمتدرب", exact: true }).click();
  await until(
    async () =>
      (await snap()).programs.filter(
        (p) => p.client_id === cid && p.published_at,
      ).length >= 2,
    "Second publish failed",
  );
  await portal
    .getByRole("button", { name: "تحديث الجدول", exact: true })
    .click();
  await until(async () => {
    const s = await snap();
    return s.media_assets.filter((a) => a.status === "ready").length >= 2;
  }, "QR asset completion failed");
  await page.goto(base + "/coach/library");
  await page.locator(".movement-card").first().waitFor();
  await page.screenshot({
    path: root + "/library-desktop.png",
    fullPage: true,
  });
  await page.goto(base + "/coach");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: root + "/dashboard-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Coach mobile overflow",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    root + "/results.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "catalog search and add",
          "direct video upload",
          "private video access",
          "meal builder and publication",
          "PIN portal",
          "daily weight correction",
          "phone QR upload and attachment",
          "stable link after republish",
          "mobile overflow",
        ],
        clientId: cid,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: studio browser, private video, QR, meals, live portal, weight correction and responsive views.",
  );
} finally {
  await browser.close();
}
