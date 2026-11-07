import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3200";
const artifact = path.resolve("artifacts/screenshots");
const temp = path.resolve("artifacts/browser-temp");
await mkdir(artifact, { recursive: true });
await mkdir(temp, { recursive: true });
process.env.TEMP = temp;
process.env.TMP = temp;
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
const errors = [];
const contexts = [];
async function login(email) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1000 },
    reducedMotion: "reduce",
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/login");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(
    email === "trainee@example.test" ? "**/me" : "**/coach",
  );
  await page.locator("h1").waitFor();
  return page;
}
async function snapshot(page) {
  const r = await page.request.get(base + "/api/export");
  assert.equal(r.status(), 200);
  return r.json();
}
async function until(check, message) {
  for (let i = 0; i < 40; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw Error(message);
}
try {
  const anonymous = await browser.newContext();
  contexts.push(anonymous);
  const anonPage = await anonymous.newPage();
  await anonPage.goto(base + "/coach");
  await anonPage.waitForURL("**/login");
  assert(anonPage.url().includes("/login"));
  const page = await login("coach@example.test");
  await page.locator("aside nav").waitFor();
  await page.screenshot({
    path: path.join(artifact, "today-desktop.png"),
    fullPage: true,
  });
  const marker = Date.now();
  const email = `browser-${marker}@example.test`;
  const clientName = "عميل متصفح اصطناعي " + marker;
  await page.goto(base + "/coach/clients?add=1");
  await page.locator('main form input[name="email"]').fill(email);
  await page.locator('main form input[name="name"]').fill(clientName);
  await page.locator('main form input[name="phone"]').fill("0501234567");
  await page.locator('main form button[type="submit"]').click();
  await page.waitForURL(/\/coach\/clients\/[a-f0-9-]+$/);
  const clientId = page.url().split("/").at(-1);
  await page.locator("#plan-name").fill("برنامج محفوظ من المتصفح");
  await page
    .getByRole("textbox", { name: "اسم التمرين 1", exact: true })
    .fill("قرفصاء اصطناعية");
  await until(async () => {
    const data = await snapshot(page);
    return data.programs.some(
      (p) => p.client_id === clientId && p.name === "برنامج محفوظ من المتصفح",
    );
  }, "Autosave failed");
  await page.reload();
  assert.equal(
    await page.locator("#plan-name").inputValue(),
    "برنامج محفوظ من المتصفح",
  );
  await page.getByRole("button", { name: "نشر للمتدرب", exact: true }).click();
  await until(async () => {
    const data = await snapshot(page);
    return data.programs.some(
      (p) => p.client_id === clientId && p.published_at,
    );
  }, "Publish failed");
  await page
    .getByRole("button", { name: "الباقات والدفعات", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "إضافة باقة أو تجديد" })
    .click();
  const subscription = page.locator('form:has(input[name="price"])');
  await subscription.locator('input[name="name"]').fill("باقة متصفح");
  await subscription.locator('input[name="price"]').fill("100");
  await subscription.locator('input[name="start_date"]').fill("2026-11-01");
  await subscription.locator('input[name="end_date"]').fill("2026-11-30");
  await subscription.locator('button[type="submit"]').click();
  await until(async () => {
    return (await snapshot(page)).subscriptions.some(
      (s) => s.client_id === clientId,
    );
  }, "Subscription failed");
  const sub = (await snapshot(page)).subscriptions.find(
    (s) => s.client_id === clientId,
  );
  await page
    .locator("summary")
    .filter({ hasText: "تسجيل دفعة جزئية أو كاملة" })
    .click();
  const payment = page.locator('form:has(input[name="amount"])');
  await payment.locator('input[name="amount"]').fill("40");
  await payment.locator('input[name="paid_date"]').fill("2026-10-28");
  await payment.locator('input[name="reference"]').fill(`UI-${marker}`);
  await payment.locator('button[type="submit"]').click();
  await until(async () => {
    return (await snapshot(page)).payments.some(
      (p) => p.reference === `UI-${marker}`,
    );
  }, "Payment failed");
  assert.equal(
    (await snapshot(page)).subscriptions.find((s) => s.id === sub.id)
      .start_date,
    "2026-11-01",
  );
  await page.locator("summary").filter({ hasText: "تجميد الباقة" }).click();
  const freeze = page.locator(
    'form:has(input[name="start_date"]):not(:has(input[name="price"]))',
  );
  await freeze.locator('input[name="start_date"]').fill("2026-11-05");
  await freeze.locator('input[name="end_date"]').fill("2026-11-07");
  await freeze.locator('button[type="submit"]').click();
  await until(async () => {
    return (
      (await snapshot(page)).subscriptions.find((s) => s.id === sub.id)
        ?.end_date === "2026-12-03"
    );
  }, "Freeze failed");
  await freeze.locator('button[type="submit"]').click();
  await freeze.getByRole("alert").waitFor();
  assert.equal(
    (await snapshot(page)).subscriptions.find((s) => s.id === sub.id).end_date,
    "2026-12-03",
  );
  await page
    .getByRole("button", { name: "البيانات والدعوة", exact: true })
    .click();
  await page
    .getByRole("button", { name: "إنشاء دعوة آمنة", exact: true })
    .click();
  const inviteUrl = await page.locator("#generated-invite").inputValue();
  assert.match(inviteUrl, /\/invite\/[a-f0-9]{64}$/);
  await page.goto(base + "/coach/clients");
  await page.getByRole("button", { name: "استيراد ملف", exact: true }).click();
  const importEmail = `import-${marker}@example.test`;
  const csv = `name,email,phone\nعميل مستورد,${importEmail},0501234567\nلا تستبدل اسمي,trainee@example.test,0509999999\nخاطئ,invalid,123\n`;
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "synthetic.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await page
    .getByRole("button", { name: "قراءة ومعاينة", exact: true })
    .click();
  await page.locator("#mapping-phone").selectOption("2");
  await page.locator('input[type="checkbox"]').nth(1).check();
  await page
    .getByRole("button", { name: "استيراد 1 عميل", exact: true })
    .click();
  await until(async () => {
    return (await snapshot(page)).clients.some((c) => c.email === importEmail);
  }, "Import failed");
  assert.equal(
    (await snapshot(page)).clients.find(
      (c) => c.email === "trainee@example.test",
    ).name,
    "سلمان التجريبي",
  );
  const second = await login("coach2@example.test");
  assert(!(await snapshot(second)).clients.some((c) => c.id === clientId));
  await second.goto(base + "/coach/clients/" + clientId);
  await second.getByText("العميل غير متاح", { exact: true }).waitFor();
  const student = await login("trainee@example.test");
  await student.getByText("برنامجك، بوضوح.", { exact: true }).waitFor();
  assert((await snapshot(student)).programs.every((p) => p.published_at));
  assert(!(await snapshot(student)).clients.some((c) => c.id === clientId));
  await student.screenshot({
    path: path.join(artifact, "trainee-desktop.png"),
    fullPage: true,
  });
  await page.goto(base + "/coach");
  await page.locator("aside nav").waitFor();
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(artifact, "today-mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real auth, coach isolation, browser import, durable draft reload, publication, package dates, partial payment, freeze replay, invite generation, trainee access, mobile layout.",
  );
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
