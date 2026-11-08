import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
const root = path.resolve("artifacts/management-ui");
await fs.mkdir(root, { recursive: true });
process.env.TEMP = root;
process.env.TMP = root;
const marker = String(Date.now()),
  qaNote = "Private management QA note " + marker,
  qaCheckin = "Management QA weekly review " + marker,
  qaMessage = "A real persisted QA message " + marker;
const base = "http://127.0.0.1:3200",
  browser = await chromium.launch({ headless: true, channel: "msedge" }),
  errors = [];
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
async function login(page, email) {
  await page.goto(base + "/login");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator("button:not([type=button])").click();
  await page.waitForURL(
    email === "trainee@example.test" ? "**/me" : "**/coach",
  );
}
async function snap(page) {
  return (await page.request.get(base + "/api/export")).json();
}
async function until(fn, label) {
  for (let i = 0; i < 60; i++) {
    if (await fn()) return;
    await page.waitForTimeout(250);
  }
  throw Error(label);
}
try {
  await login(page, "coach@example.test");
  const book = new ExcelJS.Workbook(),
    tab = book.addWorksheet("Clients");
  tab.addRow(["name", "email", "height", "status", "start_date"]);
  const scenarios = [
    "مبتدئ",
    "رياضي متقدم",
    "خفض وزن",
    "زيادة عضل",
    "بيانات ناقصة",
    "مراجعات متقطعة",
    "تقدم جيد",
    "ثبات وزن",
    "غير نشط",
    "اشتراك قريب",
  ];
  for (let i = 0; i < 50; i++)
    tab.addRow([
      `عميل اختبار ${scenarios[i % 10]} ${i + 1}`,
      `qa-management-${i + 1}@example.test`,
      i === 4 ? "" : 175,
      i === 8 ? "inactive" : "active",
      "2026-01-01",
    ]);
  const weights = book.addWorksheet("Measurements");
  weights.addRow(["email", "date", "weight", "waist", "custom:neck"]);
  for (let i = 0; i < 10; i++)
    for (const [day, weight] of [
      ["2026-01-01", 90],
      ["2026-02-01", i === 7 ? 90 : 87],
      ["2026-03-01", i === 7 ? 90 : 85],
    ])
      weights.addRow([
        `qa-management-${i + 1}@example.test`,
        day,
        weight,
        90,
        38,
      ]);
  const dayOffset = (offset) =>
    new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  for (const offset of [-21, -7, 0])
    weights.addRow([
      "qa-management-8@example.test",
      dayOffset(offset),
      90,
      90,
      38,
    ]);
  const goals = book.addWorksheet("Goals");
  goals.addRow(["email", "date", "goal", "focus", "target_weight"]);
  const nutrition = book.addWorksheet("NutritionTargets");
  nutrition.addRow([
    "email",
    "date",
    "calories",
    "protein",
    "carbs",
    "fat",
    "text",
  ]);
  const reviews = book.addWorksheet("Checkins");
  reviews.addRow([
    "email",
    "date",
    "sleep",
    "energy",
    "hunger",
    "stress",
    "training_adherence",
    "nutrition_adherence",
    "feedback",
  ]);
  const workouts = book.addWorksheet("Workouts");
  workouts.addRow([
    "email",
    "date",
    "source_key",
    "day_name",
    "completed",
    "exercise_name",
    "sets",
    "reps",
    "weight",
    "rpe",
  ]);
  for (let i = 0; i < 10; i++) {
    const email = `qa-management-${i + 1}@example.test`;
    goals.addRow([
      email,
      "2026-01-01",
      scenarios[i],
      "Fictional QA scenario",
      i === 3 ? 95 : 75,
    ]);
    nutrition.addRow([
      email,
      "2026-01-01",
      i === 3 ? 2800 : 2100,
      150,
      220,
      65,
      "Fictional QA meal guidance",
    ]);
    reviews.addRow([
      email,
      dayOffset(i === 5 ? -60 : -7),
      4,
      4,
      3,
      2,
      i === 5 ? 35 : 90,
      i === 5 ? 45 : 85,
      "Scenario: " + scenarios[i],
    ]);
    for (const [name, load] of [
      ["Bench press", i === 1 ? 100 : 40],
      ["Row", i === 1 ? 90 : 30],
    ])
      workouts.addRow([
        email,
        dayOffset(-7),
        "qa-session-" + (i + 1),
        "Upper",
        i !== 5,
        name,
        3,
        "8–12",
        load,
        8,
      ]);
  }
  const subscriptions = book.addWorksheet("Subscriptions");
  subscriptions.addRow([
    "email",
    "subscription_ref",
    "name",
    "start_date",
    "end_date",
    "price",
  ]);
  subscriptions.addRow([
    "qa-management-10@example.test",
    "qa-expiring",
    "Fictional expiring plan",
    dayOffset(-30),
    dayOffset(3),
    1000,
  ]);
  const file = root + "/50-clients.xlsx";
  await book.xlsx.writeFile(file);
  await page.goto(base + "/coach/clients");
  await page.getByRole("button", { name: "استيراد ملف", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(file);
  await page
    .getByRole("button", { name: "قراءة ومعاينة", exact: true })
    .click();
  await page.locator("#column-map-0-0").waitFor();
  assert.equal(
    await page.getByTestId("complete-import").locator("tbody tr").count(),
    50,
  );
  await page
    .getByRole("button", { name: /^استيراد/ })
    .last()
    .click();
  await until(
    async () =>
      (await snap(page)).clients.some(
        (c) => c.email === "qa-management-50@example.test",
      ),
    "multi-sheet import persisted",
  );
  const after = await snap(page);
  assert.equal(
    after.clients.filter((c) => c.email.startsWith("qa-management-")).length,
    50,
  );
  assert.equal(
    after.management.records.filter(
      (r) =>
        r.kind === "measurement" &&
        after.clients.some(
          (c) => c.id === r.client_id && c.email.startsWith("qa-management-"),
        ),
    ).length,
    33,
  );
  await page.reload();
  await page.screenshot({ path: root + "/import-results.png", fullPage: true });
  await page.goto(base + "/coach/clients");
  await page
    .locator("select")
    .filter({ has: page.locator('option[value="inactive"]') })
    .selectOption("inactive");
  assert.ok(
    (await page.locator("main tbody").innerText()).includes(
      "qa-management-9@example.test",
    ),
  );
  await page.goto(base + "/coach/library");
  await page.locator("#library-tab-templates").click();
  const tools = page.getByTestId("template-tools");
  await tools
    .getByLabel("قالب التعيين الجماعي")
    .selectOption(after.templates[0].id);
  await tools.getByLabel("بحث قائمة التعيين").fill("qa-management-");
  for (let i = 1; i <= 5; i++)
    await tools
      .locator("label")
      .filter({ hasText: `qa-management-${i}@example.test` })
      .locator('input[type="checkbox"]')
      .check();
  await tools
    .getByLabel("أوافق على استبدال المسودات الحالية للعملاء المحددين")
    .check();
  page.once("dialog", (dialog) => dialog.accept());
  await tools.getByRole("button", { name: "تعيين 5 نسخة مستقلة" }).click();
  await until(async () => {
    const data = await snap(page);
    return [1, 2, 3, 4, 5].every((i) =>
      data.programs.some(
        (p) =>
          p.client_id ===
            data.clients.find(
              (c) => c.email === `qa-management-${i}@example.test`,
            ).id && !p.published_at,
      ),
    );
  }, "bulk template assignment persisted");
  const client = after.clients.find((c) => c.email === "trainee@example.test");
  await page.goto(base + `/coach/clients/${client.id}?tab=tracking`);
  const hub = page.getByTestId("client-management-hub");
  await hub.waitFor();
  await hub.getByRole("tab", { name: "القياسات والتقدم", exact: true }).click();
  const measurement = hub.locator("form[data-record-kind=measurement]");
  await measurement.locator("[name=entry_date]").fill("2026-04-02");
  await measurement.locator("[name=weight]").fill("83.2");
  await measurement.locator("[name=waist]").fill("86");
  await measurement.locator("[name=custom]").fill("الرقبة=37");
  await measurement.locator("[name=notes]").fill(marker);
  await measurement.locator("button:not([type=button])").click();
  await until(
    async () =>
      (await snap(page)).management.records.some(
        (r) =>
          r.client_id === client.id &&
          r.kind === "measurement" &&
          r.payload.weight === 83.2 &&
          r.payload.notes === marker,
      ),
    "measurement persisted",
  );
  await hub.getByRole("tab", { name: "ملاحظات المدرب", exact: true }).click();
  await hub.locator("[name=text]").fill(qaNote);
  await hub.locator("form button:not([type=button])").click();
  await until(
    async () =>
      (await snap(page)).management.records.some(
        (r) => r.payload.text === qaNote,
      ),
    "coach note persisted",
  );
  const traineeContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    trainee = await traineeContext.newPage();
  trainee.on("pageerror", (e) => errors.push(e.message));
  await login(trainee, "trainee@example.test");
  const traineeHub = trainee.getByTestId("client-management-hub");
  await traineeHub.getByRole("tab", { name: /^المراجعات الأسبوعية/ }).click();
  const checkin = traineeHub.locator("form[data-record-kind=checkin]");
  for (const [key, value] of Object.entries({
    sleep: 4,
    energy: 4,
    hunger: 3,
    stress: 2,
    training_adherence: 85,
    nutrition_adherence: 80,
  }))
    await checkin.locator(`[name=${key}]`).fill(String(value));
  await checkin.locator("[name=feedback]").fill(qaCheckin);
  await checkin.locator("button:not([type=button])").click();
  await until(
    async () =>
      (await snap(trainee)).management.records.some(
        (r) => r.kind === "checkin" && r.payload.feedback === qaCheckin,
      ),
    "client weekly check-in persisted",
  );
  assert.ok(
    !(await snap(trainee)).management.records.some((r) => r.kind === "note"),
  );
  assert.ok(!(await trainee.locator("body").innerText()).includes(qaNote));
  await page.reload();
  await hub.getByRole("tab", { name: /^المراجعات الأسبوعية/ }).click();
  const review = hub.locator("article").filter({ hasText: qaCheckin });
  await review.locator("[name=feedback]").fill("Reviewed through coach UI");
  await review
    .getByRole("button", { name: "حفظ الرد ووضع تمت المراجعة" })
    .click();
  await until(
    async () =>
      (await snap(page)).management.records.some(
        (r) =>
          r.coach_feedback === "Reviewed through coach UI" && r.reviewed_at,
      ),
    "coach feedback persisted",
  );
  await trainee.reload();
  await traineeHub.getByRole("tab", { name: "المراسلات", exact: true }).click();
  await traineeHub
    .locator("form[data-record-kind=message] [name=text]")
    .fill(qaMessage);
  await traineeHub
    .locator("form[data-record-kind=message] button:not([type=button])")
    .click();
  await until(
    async () =>
      (await snap(page)).management.records.some(
        (r) => r.payload.text === qaMessage && r.author_type === "client",
      ),
    "message persisted",
  );
  const unsentMessage = "Unsent offline QA message " + marker;
  await trainee.waitForLoadState("networkidle");
  const offlineForm = traineeHub.locator("form[data-record-kind=message]");
  await offlineForm.locator("[name=text]").fill(unsentMessage);
  await traineeContext.setOffline(true);
  try {
    const form = offlineForm;
    await form.locator("button:not([type=button])").click();
    await traineeHub
      .getByRole("alert")
      .filter({ hasText: "تعذر الاتصال" })
      .waitFor();
    assert.equal(await form.locator("[name=text]").inputValue(), unsentMessage);
    assert.equal(
      await form.locator("button:not([type=button])").isEnabled(),
      true,
    );
  } finally {
    await traineeContext.setOffline(false);
  }
  await traineeHub
    .getByRole("tab", { name: "صور التقدم", exact: true })
    .click();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  await traineeHub.locator("input[type=file]").setInputFiles({
    name: "qa-photo-" + marker + ".png",
    mimeType: "image/png",
    buffer: png,
  });
  await traineeHub
    .getByRole("button", { name: "رفع صورة", exact: true })
    .click();
  await until(
    async () =>
      (await snap(trainee)).management.progress_photos.some(
        (p) => p.filename === "qa-photo-" + marker + ".png",
      ),
    "private photo persisted",
  );
  const photo = (await snap(trainee)).management.progress_photos.find(
    (p) => p.filename === "qa-photo-" + marker + ".png",
  );
  assert.equal(
    (
      await trainee.request.get(base + "/api/progress-photos/" + photo.id)
    ).status(),
    200,
  );
  const anon = await browser.newContext();
  assert.equal(
    (
      await anon.request.get(base + "/api/progress-photos/" + photo.id)
    ).status(),
    404,
  );
  await anon.close();
  await page.goto(base + "/coach");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.waitForFunction(
    () =>
      document.documentElement.lang === "en" &&
      document.documentElement.dir === "ltr",
  );
  await page.screenshot({ path: root + "/dashboard-en.png", fullPage: true });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      "/coach",
      "/coach/clients",
      "/coach/library",
      `/coach/clients/${client.id}?tab=tracking`,
    ]) {
      await page.goto(base + route);
      await page.locator("h1").waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `overflow ${route} ${width}`,
      );
      await page.screenshot({
        path: `${root}/en-${width}-${route.split("/").filter(Boolean).slice(0, 2).join("-")}.png`,
      });
    }
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    root + "/results.json",
    JSON.stringify(
      {
        passed: true,
        roster: 50,
        historicalMeasurements: 33,
        tests: [
          "multi-sheet UI import",
          "50-client roster",
          "dated custom measurement",
          "private notes",
          "client weekly check-in",
          "coach review",
          "client message",
          "offline error and retained unsent message",
          "private photo upload and anonymous rejection",
          "five-client bulk template assignment",
          "inactive status filtering",
          "Arabic mobile",
          "English LTR 3 widths",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("PASS management UI workflows");
} catch (error) {
  await page.screenshot({ path: root + "/failure.png", fullPage: true });
  await fs.writeFile(
    root + "/failure.txt",
    page.url() + "\n" + (await page.locator("body").innerText()),
  );
  throw error;
} finally {
  await browser.close();
}
