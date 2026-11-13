// Synthetic, local-only progress acceptance checks. Never use a hosted target.
import { dismissPhotoConsent, ensurePhotoConsent } from "./photo-consent-helper.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import sharp from "sharp";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3217";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local fixtures only");
const output = path.resolve("artifacts/progress-followthrough-browser");
await mkdir(output, { recursive: true }); process.env.TEMP = output; process.env.TMP = output;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shift = (date, days) => { const value = new Date(date + "T00:00:00Z"); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const firstDate = shift(today, -2), secondDate = shift(today, -1), marker = Date.now();
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
const passed = [], errors = [];
let lastPage;
async function until(check, message) { for (let i = 0; i < 60; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 250)); } throw Error(message); }
async function snapshot(page) { const response = await page.request.get(base + "/api/export"); assert.equal(response.status(), 200); return response.json(); }
const recordByNote = (state, note) => state.management.records.find(record => record.payload.notes === note || record.payload.feedback === note);
async function compareDates(page) {
  if (!(await page.getByRole("heading", { name: "مقارنة صورتين", exact: true }).isVisible()))
    await page.getByText("إكمال تحديث التقدم بصور أمام وخلف وجانب (اختياري)", { exact: true }).click();
  const panel = page.getByRole("heading", { name: "مقارنة صورتين", exact: true }).locator("..");
  const selects = panel.locator("select");
  await selects.nth(1).selectOption(""); await selects.nth(2).selectOption("");
  await selects.nth(1).selectOption(firstDate); await selects.nth(2).selectOption(secondDate);
  return panel;
}
const metricCells = (panel, name) => panel.getByRole("rowheader", { name, exact: true }).locator("..").locator("td").allTextContents();
try {
  const coachContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  coachContext.setDefaultTimeout(20000); coachContext.setDefaultNavigationTimeout(60000);
  const coach = await coachContext.newPage(); lastPage = coach;
  coach.on("pageerror", error => errors.push(error.message));
  await coach.goto(base + "/login");
  await coach.locator("#auth-email").fill("coach@example.test"); await coach.locator("#auth-password").fill("CoachPreview!2026");
  await coach.locator("button[type=submit]").click(); await coach.waitForURL("**/coach");
  await coach.getByText("معاينة محلية · بيانات اصطناعية محفوظة في قاعدة بيانات على جهازك · لا رسائل حقيقية", { exact: true }).waitFor();
  await coach.goto(base + "/coach/clients?add=1");
  await coach.locator('main form input[name="name"]').fill("Progress synthetic " + marker);
  await coach.locator('main form input[name="email"]').fill(`progress-${marker}@example.test`);
  await coach.locator('main form input[name="phone"]').fill("0501234567");
  await coach.locator('main form button[type=submit]').click(); await coach.waitForURL(/\/coach\/clients\/[a-f0-9-]+$/);
  const clientId = coach.url().split("/").at(-1);
  await coach.goto(`${base}/coach/clients/${clientId}?tab=profile`);
  await coach.getByRole("button", { name: "إنشاء رابط دخول للمتدرب", exact: true }).click();
  const shared = await coach.getByLabel("رابط المتدرب الخاص").inputValue();
  assert(/\/access\/[a-f0-9-]+#[a-f0-9]{64}$/.test(shared));
  const visitorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  visitorContext.setDefaultTimeout(20000); visitorContext.setDefaultNavigationTimeout(60000);
  const visitor = await visitorContext.newPage(); lastPage = visitor;
  visitor.on("pageerror", error => errors.push(error.message)); visitor.on("dialog", dialog => dialog.accept());
  await visitor.goto(shared); await visitor.waitForURL(/\/trainee\/[a-f0-9-]+$/);
  assert.equal(new URL(visitor.url()).hash, "");
  await visitor.getByRole("dialog", { name: "قبل ما ترفع صور التقدم" }).waitFor({ timeout: 2000 }).catch(() => {});
  await dismissPhotoConsent(visitor);
  const form = visitor.locator('form[data-record-kind="measurement"]');
  const notes = ["measurement-a-", "measurement-b-", "measurement-c-"].map(prefix => prefix + marker);
  async function addMeasurement(date, values, note) {
    await form.locator('[name="entry_date"]').fill(date);
    for (const [key, value] of Object.entries(values)) await form.locator(`[name="${key}"]`).fill(String(value));
    await form.locator('[name="notes"]').fill(note);
    await form.getByRole("button", { name: "حفظ قياس", exact: true }).click();
    await until(async () => Boolean(recordByNote(await snapshot(coach), note)), "Measurement not persisted: " + note);
    await visitor.getByRole("row").filter({ hasText: note }).waitFor();
  }
  await addMeasurement(firstDate, { weight: 80, waist: 90 }, notes[0]);
  await addMeasurement(secondDate, { weight: 79 }, notes[1]);
  let comparison = await compareDates(visitor);
  assert.deepEqual(await metricCells(comparison, "الوزن (كجم)"), ["80 كجم", "79 كجم", "-1.0 كجم"]);
  assert.deepEqual(await metricCells(comparison, "الخصر (سم)"), ["90 سم", "—", "—"]);
  assert.equal(await comparison.locator("img").count(), 0);
  passed.push("measurement and weight-only submissions persist; comparison dates work without photos and missing metrics remain honest"); console.log(passed.at(-1));
  await addMeasurement(secondDate, { waist: 88 }, notes[2]);
  comparison = await compareDates(visitor);
  assert.deepEqual(await metricCells(comparison, "الوزن (كجم)"), ["80 كجم", "79 كجم", "-1.0 كجم"]);
  assert.deepEqual(await metricCells(comparison, "الخصر (سم)"), ["90 سم", "88 سم", "-2.0 سم"]);
  let state = await snapshot(coach); const correctedId = recordByNote(state, notes[2]).id;
  let row = visitor.getByRole("row").filter({ hasText: notes[2] });
  await row.locator("summary").filter({ hasText: "تصحيح التحديث أو حذفه" }).click();
  await row.locator('input[name="waist"]').fill("87");
  await row.getByRole("button", { name: "حفظ التصحيح", exact: true }).click();
  await until(async () => (await snapshot(coach)).management.records.find(record => record.id === correctedId)?.payload.waist === 87, "Measurement correction failed");
  // A creation may already have a modification timestamp. Wait for the actual
  // corrected value, so a pending refresh cannot replace the reopened editor.
  await until(async () => (await visitor.getByRole("row").filter({ hasText: notes[2] }).innerText()).includes("الخصر: 87 سم"), "Corrected measurement did not appear in the timeline");
  await visitor.getByRole("row").filter({ hasText: notes[2] }).getByText("آخر تعديل", { exact: false }).waitFor();
  state = await snapshot(coach); assert.equal(state.management.records.find(record => record.id === correctedId).author_type, "client");
  row = visitor.getByRole("row").filter({ hasText: notes[2] });
  if (!(await row.locator("details").evaluate(element => element.open))) await row.locator("summary").click();
  await row.getByRole("button", { name: "حذف التحديث", exact: true }).click();
  await until(async () => !(await snapshot(coach)).management.records.some(record => record.id === correctedId), "Measurement deletion failed");
  await visitor.getByRole("row").filter({ hasText: notes[2] }).waitFor({ state: "detached" });
  comparison = await compareDates(visitor); assert.deepEqual(await metricCells(comparison, "الخصر (سم)"), ["90 سم", "—", "—"]);
  passed.push("same-date sparse updates merge correctly; trainee correction preserves attribution and deletion removes only its target"); console.log(passed.at(-1));
  await coach.goto(`${base}/coach/clients/${clientId}?tab=tracking`);
  const coachRow = coach.getByRole("row").filter({ hasText: notes[0] });
  const measurementFeedback = "Coach measurement feedback " + marker;
  await coachRow.locator('textarea[name="coach_feedback"]').fill(measurementFeedback);
  assert.equal(await coachRow.locator('textarea[name="coach_feedback"]').evaluate(element => new FormData(element.form).get("coach_feedback")), measurementFeedback);
  await coachRow.getByRole("button", { name: "حفظ الرد على التحديث", exact: true }).click();
  await until(async () => recordByNote(await snapshot(coach), notes[0])?.coach_feedback === measurementFeedback, "Measurement feedback not saved").catch(async error => { await coach.screenshot({ path: output + "/coach-feedback-failure.png", fullPage: true }); throw Error(error.message + " · " + await coachRow.innerText()); });
  await visitor.getByRole("button", { name: "تحديث الجدول", exact: true }).click();
  await visitor.getByText(measurementFeedback, { exact: true }).waitFor();
  passed.push("coach feedback on a measurement persists and is visible to its trainee"); console.log(passed.at(-1));
  await form.locator('[name="entry_date"]').fill(firstDate);
  if (!(await visitor.getByRole("heading", { name: "مقارنة صورتين", exact: true }).isVisible()))
    await visitor.getByText("إكمال تحديث التقدم بصور أمام وخلف وجانب (اختياري)", { exact: true }).click();
  await ensurePhotoConsent(visitor);
  assert.equal(await visitor.getByLabel("تاريخ الصور", { exact: true }).inputValue(), firstDate);
  const image = await sharp({ create: { width: 1200, height: 1800, channels: 3, background: "#4679bc" } }).jpeg().toBuffer();
  for (const [label, angle] of [["صورة تقدم خاصة", "أمام"], ["صورة خلف", "خلف"], ["صورة جانب", "جانب"]]) {
    await visitor.getByLabel(label, { exact: true }).setInputFiles({ name: "synthetic.jpg", mimeType: "image/jpeg", buffer: image });
    await visitor.getByRole("button", { name: "إزالة صورة " + angle, exact: true }).waitFor();
  }
  await visitor.getByRole("button", { name: "رفع الصور المختارة", exact: true }).click();
  await until(async () => (await snapshot(coach)).management.progress_photos.filter(photo => photo.client_id === clientId && photo.status === "ready").length === 3, "Three-angle photo submission failed");
  await until(async () => await visitor.locator(".progress-photo-angle-card.has-photo").count() === 3, "Saved photo timeline did not refresh");
  const photos = (await snapshot(coach)).management.progress_photos.filter(photo => photo.client_id === clientId);
  assert(photos.every(photo => photo.entry_date === firstDate)); assert.deepEqual(photos.map(photo => photo.angle).sort(), ["back", "front", "side"]);
  assert.deepEqual(await visitor.locator(".progress-photo-angle-card h5").allTextContents(), ["أمام", "خلف", "جانب"]);
  const thumb = visitor.locator(".progress-photo-timeline-image img").first();
  const thumbUrl = await thumb.getAttribute("src"); assert(thumbUrl.includes("variant=thumbnail"));
  const thumbResponse = await visitor.request.get(base + thumbUrl); assert.equal(thumbResponse.status(), 200);
  const thumbMeta = await sharp(await thumbResponse.body()).metadata();
  assert(Math.max(thumbMeta.width, thumbMeta.height) <= 384); assert.equal(thumbMeta.width / thumbMeta.height, 2 / 3);
  assert.equal(thumbResponse.headers()["cache-control"], "private, no-store");
  await visitor.locator(".progress-photo-timeline-image").first().click();
  const dialog = visitor.getByRole("dialog", { name: "عرض صورة التقدم", exact: true }); await dialog.waitFor();
  assert(!(await dialog.locator("img").getAttribute("src")).includes("variant="));
  assert.equal(await dialog.locator("img").evaluate(element => getComputedStyle(element).objectFit), "contain");
  await visitor.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
  passed.push("measurement and three labelled photo angles share one selected date; private thumbnails preserve proportions and zoom requests full image"); console.log(passed.at(-1));
  await visitor.screenshot({ path: output + "/trainee-progress-mobile.png", fullPage: true });
  await visitor.getByRole("tab", { name: "المراجعات الأسبوعية", exact: true }).click();
  const checkin = visitor.locator('form[data-record-kind="checkin"]'), checkinNote = "Checkin " + marker;
  await checkin.locator('[name="entry_date"]').fill(today);
  for (const [key, value] of Object.entries({ weight: 79, sleep: 3, energy: 4, hunger: 2, stress: 3, training_adherence: 80, nutrition_adherence: 85 })) await checkin.locator(`[name="${key}"]`).fill(String(value));
  await checkin.locator('textarea[name="feedback"]').fill(checkinNote);
  await checkin.getByRole("button", { name: "حفظ مراجعة أسبوعية", exact: true }).click();
  await until(async () => Boolean(recordByNote(await snapshot(coach), checkinNote)), "Check-in not saved");
  const checkinId = recordByNote(await snapshot(coach), checkinNote).id;
  let article = visitor.locator("article").filter({ hasText: checkinNote }).first();
  await article.locator("summary").filter({ hasText: "تصحيح التحديث أو حذفه" }).click();
  await article.locator('input[name="weight"]').fill("78.8"); await article.getByRole("button", { name: "حفظ التصحيح", exact: true }).click();
  await until(async () => (await snapshot(coach)).management.records.find(record => record.id === checkinId)?.payload.weight === 78.8, "Check-in correction not saved");
  lastPage = coach;
  // The coach's tab includes a pending-review count in its accessible name.
  await coach.goto(`${base}/coach/clients/${clientId}?tab=tracking`); await coach.getByRole("tab", { name: /^المراجعات الأسبوعية/ }).click();
  const coachArticle = coach.locator("article").filter({ hasText: checkinNote }).first(), weeklyFeedback = "Coach weekly feedback " + marker;
  await coachArticle.locator('textarea[name="feedback"]:visible').fill(weeklyFeedback);
  await coachArticle.getByRole("button", { name: "حفظ الرد ووضع تمت المراجعة", exact: true }).click();
  await until(async () => (await snapshot(coach)).management.records.find(record => record.id === checkinId)?.coach_feedback === weeklyFeedback, "Weekly review not saved");
  lastPage = visitor;
  await visitor.getByRole("button", { name: "تحديث الجدول", exact: true }).click(); await visitor.getByText(weeklyFeedback, { exact: true }).waitFor();
  article = visitor.locator("article").filter({ hasText: checkinNote }).first(); await article.locator("summary").click();
  await article.getByRole("button", { name: "حذف التحديث", exact: true }).click();
  await until(async () => !(await snapshot(coach)).management.records.some(record => record.id === checkinId), "Check-in deletion not saved");
  passed.push("weekly check-in saves, corrects and deletes; coach review remains trainee-visible before deletion"); console.log(passed.at(-1));
  await visitor.screenshot({ path: output + "/trainee-checkin-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(output + "/result.json", JSON.stringify({ passed, errors, syntheticLocalOnly: true }, null, 2));
} catch (error) {
  if (lastPage) await lastPage.screenshot({ path: output + "/failure.png", fullPage: true }).catch(() => {});
  await writeFile(output + "/result.json", JSON.stringify({ passed, failure: String(error), syntheticLocalOnly: true }, null, 2)); throw error;
} finally { await browser.close(); }
