// Local synthetic fixture verification only. Never use against hosted data.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3217";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Local test host required");
const output = path.resolve("artifacts/template-followthrough-browser");
await mkdir(output, { recursive: true });
process.env.TEMP = output; process.env.TMP = output;
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
const passed = [], errors = [];
let page;
const snapshot = async () => { const response = await page.request.get(base + "/api/export"); assert.equal(response.status(), 200); return response.json(); };
async function until(check, message) { for (let i = 0; i < 50; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 250)); } throw Error(message); }
const mark = message => { passed.push(message); console.log(message); };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(15000);
  page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.goto(base + "/login");
  await page.locator("#auth-email").fill("coach@example.test");
  await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator("button[type=submit]").click(); await page.waitForURL("**/coach");
  await page.getByText("معاينة محلية ·", { exact: false }).waitFor();
  assert((await page.locator("body").innerText()).includes("معاينة محلية"), "Synthetic local mode banner required before mutations");
  const baseline = await snapshot();
  const clients = baseline.clients.filter(client => !client.archived).slice(0, 2); assert.equal(clients.length, 2);
  for (const [index, client] of clients.entries()) {
    await page.goto(`${base}/coach/clients/${client.id}/edit?tab=nutrition`);
    const form = page.getByTestId("nutrition-target-editor");
    const caloriesSwitch = form.getByRole("switch", { name: "احسب السعرات تلقائيًا من الماكروز" });
    if ((await caloriesSwitch.getAttribute("aria-checked")) === "true") await caloriesSwitch.click();
    await form.getByLabel("السعرات (kcal)", { exact: true }).fill(String(index ? 2800 : 1700));
    await form.getByLabel("البروتين (غ)", { exact: true }).fill(String(index ? 180 : 120));
    await form.getByLabel("الكارب (غ)", { exact: true }).fill(String(index ? 340 : 180));
    await form.getByLabel("الدهون (غ)", { exact: true }).fill(String(index ? 80 : 55));
    await form.getByLabel("ملاحظات التغذية", { exact: true }).fill("هدف شخصي لا يستبدله القالب العام");
    const existingMeals = await form.getByLabel("اسم الوجبة 1", { exact: true }).count();
    if (!existingMeals) await form.getByRole("button", { name: "وجبة", exact: true }).click();
    await form.getByLabel("اسم الوجبة 1", { exact: true }).fill("الفطور");
    await form.getByLabel("مكونات الوجبة 1", { exact: true }).fill("طعام شخصي محفوظ");
    await form.getByLabel("سعرات الوجبة 1", { exact: true }).fill(String(index ? 700 : 425));
    await form.getByRole("button", { name: "حفظ السعرات للمتدرب", exact: true }).click();
    await form.getByRole("status").filter({ hasText: "تم الحفظ" }).waitFor();
  }
  mark("two trainees receive distinct saved personal daily and meal targets through their own editors");
  const beforeAssignment = await snapshot();
  const originalPrograms = beforeAssignment.programs.filter(program => clients.some(client => client.id === program.client_id));
  const existing = beforeAssignment.templates.find(template => template.content.days.some(day => day.exercises.length)); assert(existing);
  await page.goto(base + "/coach/library"); await page.getByRole("tab", { name: "قوالب البرامج", exact: true }).click();
  const oldCard = page.locator("article").filter({ has: page.getByRole("heading", { name: existing.name, exact: true }) });
  await oldCard.getByRole("button", { name: "فتح وتعديل", exact: true }).click();
  await page.locator(".program-exercise-more summary").first().click();
  assert(await page.getByText("فيديو شرح التمرين", { exact: true }).count());
  assert(await page.getByLabel("رابط فيديو اختياري (https)", { exact: true }).count());
  assert.equal(await page.locator('input[aria-label^="الوزن (كجم) للتمرين"]').count(), 0);
  assert.equal(await page.locator('input[aria-label^="الإيقاع للتمرين"]').count(), 0);
  mark("generic workout template keeps demonstration videos and hides personal weight/tempo controls");
  await page.getByRole("button", { name: "قالب جديد", exact: true }).click();
  const name = "تغذية عامة " + Date.now();
  // The template is created only after it is named.
  await page.locator("#template-name-input").fill(name);
  await page.getByRole("button", { name: "إنشاء القالب", exact: true }).click();
  await page.locator("#plan-name").waitFor();
  await page.locator("#template-kind").selectOption("nutrition");
  await page.locator("#nutrition-text").fill("أطعمة عامة مشتركة مع بقاء كل هدف غذائي شخصي");
  await page.getByRole("button", { name: "وجبة", exact: true }).click();
  await page.getByLabel("اسم الوجبة 1", { exact: true }).fill("الفطور");
  await page.getByLabel("مكونات الوجبة 1", { exact: true }).fill("أطعمة القالب العامة");
  assert.equal(await page.locator("#nutrition-calories").count(), 0);
  assert.equal(await page.locator(".program-session").count(), 0);
  await until(async () => { const data = await snapshot(); const template = data.templates.find(item => item.name === name); return Boolean(template && data.management.template_metadata.some(meta => meta.template_id === template.id && meta.kind === "nutrition")); }, "Nutrition-only template failed to persist without exercises");
  const created = (await snapshot()).templates.find(item => item.name === name);
  mark("nutrition-only template saves without requiring exercises or exposing common macro fields");
  await page.getByRole("button", { name: "رجوع للقوالب", exact: true }).click();
  await page.getByLabel("قالب التعيين الجماعي", { exact: true }).selectOption(created.id);
  const tools = page.getByTestId("template-tools");
  for (const client of clients) await tools.locator("label").filter({ hasText: client.email }).getByRole("checkbox").check();
  await tools.getByRole("button", { name: "تعيين 2 نسخة مستقلة", exact: true }).click();
  await tools.getByRole("status").filter({ hasText: "تم الحفظ" }).waitFor();
  const assigned = await snapshot();
  for (const [index, client] of clients.entries()) {
    const target = assigned.management.records.filter(record => record.client_id === client.id && record.kind === "nutrition_target").sort((a,b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at))[0];
    assert.equal(target.payload.calories, index ? 2800 : 1700); assert.equal(target.payload.protein, index ? 180 : 120);
    assert.equal(target.payload.text, "أطعمة عامة مشتركة مع بقاء كل هدف غذائي شخصي");
    assert.equal(target.payload.meals[0].foods, "أطعمة القالب العامة"); assert.equal(target.payload.meals[0].calories, index ? 700 : 425);
  }
  assert.deepEqual(assigned.programs.filter(program => clients.some(client => client.id === program.client_id)), originalPrograms);
  mark("same general nutrition assignment preserves each trainee's different daily/meal targets and all workout records");
  await page.screenshot({ path: output + "/nutrition-assignment-desktop.png", fullPage: true });
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await card.getByRole("button", { name: "حذف القالب " + name, exact: true }).click();
  await until(async () => !(await snapshot()).templates.some(template => template.id === created.id), "Direct card deletion failed");
  const afterDelete = await snapshot();
  assert.deepEqual(afterDelete.management.records.filter(record => clients.some(client => client.id === record.client_id) && record.kind === "nutrition_target"), assigned.management.records.filter(record => clients.some(client => client.id === record.client_id) && record.kind === "nutrition_target"));
  assert.deepEqual(afterDelete.programs.filter(program => clients.some(client => client.id === program.client_id)), originalPrograms);
  mark("direct library-card deletion removes template while retaining assigned nutrition history and programs");
  assert.deepEqual(errors, []);
  await writeFile(output + "/result.json", JSON.stringify({ passed, errors, syntheticLocalOnly: true }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: output + "/failure.png", fullPage: true }).catch(() => {});
  await writeFile(output + "/result.json", JSON.stringify({ passed, failure: String(error), syntheticLocalOnly: true }, null, 2));
  throw error;
} finally { await browser.close(); }
