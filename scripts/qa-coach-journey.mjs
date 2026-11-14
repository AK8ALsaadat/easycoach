import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
// A fictional Free coach's own journey: login, adding a trainee, session
// balance and attendance, plan gating and the subscription page. Synthetic
// accounts in an isolated local database only; no provider call, no email and
// no real person's data. Real registration needs Supabase Auth and a mailbox,
// so the local preview hides it on purpose; its form rules are checked by
// scripts/qa-registration-browser-check.mjs and its server action by
// tests/registration-password.test.ts with a mocked Auth provider.
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3215";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Local synthetic QA only");
const dir = "artifacts/platform-coach-journey";
await mkdir(dir, { recursive: true });
const riyadh = days => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = new Date(today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(120000);

  // 1. The local preview offers no registration path, so nothing here can
  // create a half-real account or send an email.
  await page.goto(base + "/login");
  await page.waitForLoadState("networkidle");
  await page.locator("#auth-email").waitFor();
  assert.equal(await page.getByRole("button", { name: "جديد هنا؟ أنشئ حسابك", exact: true }).count(), 0, "Local preview must not offer registration");
  assert.equal(await page.locator("#auth-password-confirmation").count(), 0);

  // 2. Login as the fictional Free coach prepared for this run.
  await page.locator("#auth-email").fill("journey@example.test");
  await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/coach");
  await page.getByText("Fictional journey client", { exact: false }).first().waitFor();
  await page.screenshot({ path: dir + "/coach-workspace.png", fullPage: true });

  // 3. Adding a trainee under the Free limit succeeds.
  await page.goto(base + "/coach/clients?add=1");
  const form = page.locator('form:has(input[name="email"])');
  await form.locator('input[name="name"]').fill("Fictional journey second client");
  await form.locator('input[name="email"]').fill("journey-second@example.test");
  await form.locator('button[type="submit"]').click();
  await page.getByText("Fictional journey second client", { exact: false }).first().waitFor();

  // 4. Free gating: programs and the exercise library start at the paid plan.
  await page.goto(base + "/coach/library");
  await page.getByText("هذه الميزة متاحة ابتداءً", { exact: false }).waitFor();
  assert.equal((await page.request.get(base + "/api/export")).status(), 403, "Export must stay closed on Free");

  // 5. Session balance and attendance, which Free does include.
  await page.goto(base + "/attendance");
  await page.locator("h1").waitFor();
  await page.getByText("باقة حضور اصطناعية", { exact: false }).first().waitFor();
  const limitForm = page.locator('form:has(input[name="sessions"])').first();
  await limitForm.locator('input[name="sessions"]').fill("1");
  await limitForm.locator("button").click();
  await limitForm.getByRole("status").filter({ hasText: "تم الحفظ" }).waitFor();
  const attendanceForm = () => page.locator('form:has(input[name="attendance_date"])').first();
  await attendanceForm().locator('input[name="attendance_date"]').fill(riyadh(0));
  await attendanceForm().locator("button").click();
  await attendanceForm().getByRole("status").filter({ hasText: "تم الحفظ" }).waitFor();
  await page.goto(base + "/attendance");
  await page.getByText("الحضور: 1 · الرصيد: 0", { exact: false }).first().waitFor();
  // A second session beyond the balance is refused by SQL, not by the interface.
  await attendanceForm().locator('input[name="attendance_date"]').fill(riyadh(-1));
  await attendanceForm().locator("button").click();
  await attendanceForm().getByRole("status").filter({ hasText: "استهلكت جميع الحصص" }).waitFor();
  // A date outside the package is refused as well.
  await attendanceForm().locator('input[name="attendance_date"]').fill(riyadh(30));
  await attendanceForm().locator("button").click();
  await attendanceForm().getByRole("status").filter({ hasText: "تاريخ الحضور خارج فترة الباقة أو في المستقبل" }).waitFor();
  await page.screenshot({ path: dir + "/attendance-balance.png", fullPage: true });

  // 6. The subscription page states the plan, the real usage and that card
  // management stays disabled; checkout refuses the signed-in coach too.
  await page.goto(base + "/subscription");
  await page.locator("h1").waitFor();
  await page.getByText("الباقة المتاحة الآن:", { exact: false }).waitFor();
  await page.getByText("المجانية", { exact: false }).first().waitFor();
  await page.getByText("2 / 5", { exact: false }).first().waitFor();
  assert.equal(await page.locator('form:has(input[name="color"])').count(), 0, "Portal colour is a paid feature");
  assert.equal((await page.request.post(base + "/api/platform/checkout")).status(), 503, "Disabled provider must refuse checkout");
  await page.screenshot({ path: dir + "/subscription-free.png", fullPage: true });

  // 7. Team space needs a plan that supports it; the page says so instead of
  // showing controls that would fail.
  await page.goto(base + "/organization");
  await page.getByText("هذه المساحة تحتاج باقة تدعم الفريق", { exact: false }).waitFor();

  // 8. The remaining coach pages load for this account, on a phone width too.
  for (const path of ["/reports", "/pricing", "/subscription/confirm?plan=starter"]) {
    const response = await page.goto(base + path);
    assert.equal(response.status(), 200, path);
    await page.locator("h1").waitFor();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/coach", "/attendance", "/subscription", "/pricing"]) {
    await page.goto(base + path);
    await page.locator("h1,h2").first().waitFor();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: dir + "/mobile-" + path.slice(1) + ".png", fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), path + " overflows on mobile");
  }
  await page.screenshot({ path: dir + "/coach-mobile.png", fullPage: true });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    localRegistrationHidden: true, login: "journey@example.test",
    clientAdded: true, freeGating: { library: true, export: 403 },
    attendance: { recorded: 1, overBalanceRefused: true, outOfRangeRefused: true },
    subscription: { plan: "free", usage: "2 / 5", checkout: 503 }, mobileOverflow: false, uncaughtErrors: 0, screenshots: dir,
  }));
} finally { await browser.close(); }
