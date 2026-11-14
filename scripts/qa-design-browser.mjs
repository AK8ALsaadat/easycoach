import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const base = process.env.TEST_BASE_URL;
assert(base && ["127.0.0.1", "localhost"].includes(new URL(base).hostname), "An isolated local server is required");
const dir = "artifacts/design-release";
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
const errors = [], results = [];
async function session(email, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": `design-qa-${crypto.randomUUID()}` } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(180000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/login");
  await page.waitForLoadState("networkidle");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(email.startsWith("trainee") ? "**/me" : "**/coach");
  await page.waitForLoadState("networkidle");
  const later = page.getByRole("button", { name: "مو الحين", exact: true });
  if (email.startsWith("trainee")) {
    await later.waitFor({ state: "visible", timeout: 5000 }).then(() => later.click()).catch(error => { if (error.name !== "TimeoutError") throw error; });
  }
  return { context, page };
}
async function snapshot(page) {
  const response = await page.request.get(base + "/api/export");
  assert.equal(response.status(), 200);
  return response.json();
}
async function until(check, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 250)); }
  throw Error(message);
}
async function screen(page, name) {
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, "Horizontal overflow: " + page.url());
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}
try {
  const guest = await browser.newContext({ reducedMotion: "reduce" });
  const login = await guest.newPage();
  for (const theme of ["light", "dark"]) {
    await guest.addCookies([{ name: "ec_theme", value: theme, url: base }]);
    for (const width of [1440, 390]) {
      await login.setViewportSize({ width, height: 900 });
      await login.goto(base + "/login");
      await screen(login, `login-${theme}-${width}`);
    }
  }
  await guest.close();
  results.push("Login: desktop/mobile, light/dark, RTL and no horizontal overflow");
  const trial = await session("trial@example.test", 390);
  await trial.page.goto(base + "/coach/library");
  await trial.page.getByText("هذه الميزة متاحة ابتداءً", { exact: false }).waitFor();
  await trial.page.goto(base + "/start?plan=pro");
  await screen(trial.page, "start-mobile");
  assert.equal(await trial.page.locator(".plan-card").count(), 4);
  assert.equal(await trial.page.getByText(/2099|31 ديسمبر 2026/).count(), 0);
  await trial.page.locator(".plan-card.is-featured").getByRole("link", { name: "ابدأ 14 يومًا مجانًا", exact: true }).click();
  await trial.page.waitForURL("**/subscription/confirm?plan=pro");
  await screen(trial.page, "trial-review-mobile");
  await trial.page.locator('[name="terms_acceptance"]').check();
  await trial.page.getByRole("button", { name: "ابدأ 14 يومًا مجانًا الآن", exact: true }).click();
  await trial.page.waitForURL("**/coach?trial=started");
  await trial.page.getByText("بدأت تجربتك المجانية", { exact: false }).first().waitFor();
  await trial.page.goto(base + "/subscription");
  await screen(trial.page, "trial-subscription-mobile");
  await trial.page.goto(base + "/coach/library");
  await trial.page.waitForLoadState("networkidle");
  assert.equal(await trial.page.getByText("هذه الميزة متاحة ابتداءً", { exact: false }).count(), 0);
  await trial.page.goto(base + "/start");
  await trial.page.waitForURL("**/coach");
  results.push("Trial: free feature gate, four plans, open offer, start, subscription status, unlocked library, no second onboarding");
  await trial.context.close();

  const coach = await session("coach@example.test");
  const data = await snapshot(coach.page);
  const client = data.clients.find(c => c.email === "trainee@example.test");
  assert(client);
  const routes = ["/coach", "/coach/clients", "/coach/library", "/coach/finance", "/coach/settings", `/coach/clients/${client.id}`, `/coach/clients/${client.id}/edit`, "/pricing", "/subscription", "/organization", "/attendance", "/reports", "/subscription/confirm?plan=pro", "/privacy", "/terms", "/contact"];
  for (const theme of process.env.QA_SKIP_SCREENSHOTS === "true" ? [] : ["light", "dark"]) {
    console.log("Reviewing coach screens: " + theme);
    await coach.context.addCookies([{ name: "ec_theme", value: theme, url: base }]);
    for (const width of [1440, 390]) {
      await coach.page.setViewportSize({ width, height: 900 });
      for (const [index, route] of routes.entries()) {
        const response = await coach.page.goto(base + route);
        assert.equal(response.status(), 200, route);
        await screen(coach.page, `coach-${theme}-${width}-${index}`);
      }
    }
  }
  if (process.env.QA_SKIP_SCREENSHOTS !== "true") results.push("Coach: all primary routes, desktop/mobile, light/dark, RTL and no horizontal overflow");
  await coach.page.goto(`${base}/coach/clients/${client.id}/edit`);
  await coach.page.waitForLoadState("networkidle");
  const published = (await snapshot(coach.page)).programs.find(p => p.client_id === client.id && p.published_at);
  const exerciseName = "تمرين تحقق التصميم " + Date.now();
  await coach.page.locator("#custom-exercise-name").fill(exerciseName);
  await coach.page.getByRole("button", { name: "إضافة التمرين", exact: true }).click();
  await coach.page.getByRole("button", { name: "حفظ المسودة", exact: true }).click();
  await until(async () => (await snapshot(coach.page)).programs.some(p => p.client_id === client.id && !p.published_at && p.content.days.some(d => d.exercises.some(e => e.name === exerciseName))), "Draft did not persist");
  assert.deepEqual((await snapshot(coach.page)).programs.find(p => p.id === published.id).content, published.content);
  await coach.page.getByRole("button", { name: "نشر للمتدرب", exact: true }).click();
  await until(async () => (await snapshot(coach.page)).programs.some(p => p.client_id === client.id && p.published_at && p.content.days.some(d => d.exercises.some(e => e.name === exerciseName))), "Publication did not persist");
  results.push("Program: add exercise, save private draft, preserve publication, publish changes");
  await coach.page.goto(base + "/coach/library");
  await coach.page.getByRole("tab", { name: "تماريني الخاصة", exact: true }).click();
  const video = await coach.page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 420;
    const ctx = canvas.getContext("2d"), stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" }), chunks = [];
    return new Promise(resolve => {
      recorder.ondataavailable = event => chunks.push(event.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const bytes = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
        resolve(btoa(String.fromCharCode(...bytes)));
      };
      recorder.start(); ctx.fillStyle = "#286b79"; ctx.fillRect(0, 0, 240, 420);
      setTimeout(() => recorder.stop(), 800);
    });
  });
  const library = coach.page.locator("#library-panel-exercises");
  const mediaName = "فيديو تحقق التصميم " + Date.now();
  await library.getByLabel("اسم التمرين", { exact: true }).fill(mediaName);
  await library.locator('input[type="file"]').setInputFiles({ name: "design.webm", mimeType: "video/webm", buffer: Buffer.from(video, "base64") });
  await library.locator("form video").waitFor();
  await library.getByRole("button", { name: "إضافة إلى مكتبتي", exact: true }).click();
  await until(async () => (await snapshot(coach.page)).exercises.some(e => e.name === mediaName && e.media_id), "Exercise video did not persist");
  await coach.page.goto(base + "/coach/settings");
  await coach.page.waitForLoadState("networkidle");
  const branding = coach.page.locator("section", { has: coach.page.locator("#coach-branding-heading") });
  const portrait = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#3978d4" } }).jpeg().withExif({ IFD0: { Artist: "Private QA metadata" } }).toBuffer();
  await branding.getByLabel("صورة المدرب", { exact: true }).setInputFiles({ name: "portrait.jpg", mimeType: "image/jpeg", buffer: portrait });
  await branding.getByRole("button", { name: "حفظ الهوية", exact: true }).click();
  await branding.getByRole("status").filter({ hasText: "تم حفظ هويتك" }).waitFor();
  const avatarPath = await branding.getByAltText("معاينة صورة المدرب").getAttribute("src");
  const avatar = await coach.page.request.get(base + avatarPath);
  assert.equal(avatar.status(), 200);
  const metadata = await sharp(await avatar.body()).metadata();
  assert.equal(metadata.width, 512); assert.equal(metadata.height, 512); assert.equal(metadata.exif, undefined);
  results.push("Uploads: exercise video saved to private library; coach portrait saved, resized and metadata stripped");
  await coach.context.close();

  const trainee = await session("trainee@example.test", 390);
  await trainee.page.getByText(exerciseName, { exact: true }).first().waitFor();
  for (const theme of ["light", "dark"]) {
    await trainee.context.addCookies([{ name: "ec_theme", value: theme, url: base }]);
    await trainee.page.reload();
    await screen(trainee.page, `trainee-${theme}-mobile`);
  }
  await trainee.page.locator('[data-day-jump="0"]').click();
  await trainee.page.locator('[data-program-day="0"]').getByRole("button", { name: "سجّل هذه الحصة", exact: true }).click();
  const workout = trainee.page.locator('[data-testid="session-form"]');
  await workout.locator('[name="reps-0-0"]').fill("9");
  await workout.locator('[name="weight-0-0"]').fill("52.5");
  await workout.getByRole("button", { name: "حفظ الحصة", exact: true }).click();
  await until(async () => (await snapshot(trainee.page)).management.records.some(r => r.kind === "workout_log" && r.payload.exercises[0]?.set_logs?.[0]?.weight === 52.5), "Workout did not persist");
  const weight = trainee.page.locator(".weight-entry-form");
  await weight.getByRole("textbox", { name: "الوزن بالكيلوجرام", exact: true }).fill("77.4");
  await weight.getByRole("button").filter({ hasText: /تصحيح الوزن|تسجيل الوزن/ }).click();
  await until(async () => (await snapshot(trainee.page)).weights.some(w => Number(w.weight) === 77.4), "Weight did not persist");
  await trainee.page.getByText("تم حفظ الوزن", { exact: true }).waitFor();
  await trainee.page.waitForLoadState("networkidle");
  const photoTab = trainee.page.getByRole("tab", { name: "صور التقدم", exact: true });
  await photoTab.click();
  await until(async () => await photoTab.getAttribute("aria-selected") === "true", "Photo tab did not open");
  const enable = trainee.page.getByRole("button", { name: "تفعيل صور التقدم", exact: true });
  await enable.or(trainee.page.locator('input[id^="progress-photo-"]').first()).waitFor({ state: "attached" });
  if (await enable.isVisible()) { await enable.click(); await trainee.page.getByRole("button", { name: "موافق، أبي أرفع صور", exact: true }).click(); }
  const buffer = await sharp({ create: { width: 640, height: 800, channels: 3, background: "#286b79" } }).png().toBuffer();
  const files = trainee.page.locator('input[id^="progress-photo-"]');
  await files.first().waitFor({ state: "attached" });
  for (let i = 0; i < 3; i++) await files.nth(i).setInputFiles({ name: `design-${i}.png`, mimeType: "image/png", buffer });
  await trainee.page.getByRole("button", { name: "رفع الصور المختارة", exact: true }).click();
  await trainee.page.getByText("تم حفظ الصور. يمكنك إضافة زاوية أخرى أو العودة لاحقًا.", { exact: true }).waitFor();
  await screen(trainee.page, "trainee-upload-complete");
  results.push("Trainee: published exercises visible, workout sets, weight and three progress-photo uploads saved");
  await trainee.context.close();
  assert.deepEqual(errors, []);
  await writeFile(`${dir}/results.json`, JSON.stringify({ syntheticLocalOnly: true, results, browserErrors: errors }, null, 2));
  console.log(results.join("\n"));
} catch (error) {
  for (const [i, context] of browser.contexts().entries()) for (const [j, page] of context.pages().entries()) {
    console.error("Failed page:", page.url());
    await page.screenshot({ path: `${dir}/failure-${i}-${j}.png`, fullPage: true }).catch(() => {});
  }
  throw error;
} finally { await browser.close(); }
