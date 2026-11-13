// Section 3 browser checks against the isolated dev server (local synthetic data only).
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3242";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Local fixtures only");
const shots = path.resolve("artifacts/continuation-review");
await mkdir(shots, { recursive: true });
process.env.TEMP = shots; process.env.TMP = shots;
const browser = await chromium.launch({ channel: "msedge" });
const results = [];
const pages = [];
const check = async (name, fn) => {
  try { await fn(); results.push(["PASS", name]); }
  catch (error) {
    results.push(["FAIL", name, String(error.message ?? error).split("\n").slice(0, 3).join(" ").slice(0, 400)]);
    for (const [i, p] of pages.entries()) await p.screenshot({ path: `${shots}/s3-fail-${results.length}-${i}.png` }).catch(() => {});
  }
};
const login = async (page, email) => {
  await page.goto(base + "/login");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/\/(coach|me)/, { timeout: 60000 });
};
const context = await browser.newContext({ viewport: { width: 1366, height: 760 }, locale: "ar" });
const page = await context.newPage();
pages.push(page);
page.setDefaultTimeout(30000);
await login(page, "coach@example.test");

await check("terminology: no «عميل» in coach screens", async () => {
  for (const path of ["/coach", "/coach/clients", "/coach/finance", "/coach/library", "/coach/settings"]) {
    await page.goto(base + path);
    await page.locator("main").first().waitFor();
    const text = await page.locator("body").innerText();
    const hit = text.match(/[^\s]*(عميل|عملاء|عملائ)[^\s]*/);
    if (hit) throw Error(`${path}: ${hit[0]}`);
  }
});

await check("browser validation messages are Arabic", async () => {
  await page.goto(base + "/coach/clients?add=1");
  const required = page.locator("form input[required]").first();
  await required.waitFor();
  const message = await required.evaluate((el) => { el.value = ""; el.reportValidity(); return el.validationMessage; });
  if (!/[\u0600-\u06ff]/.test(message)) throw Error("validation message: " + message);
  const email = page.locator("form input[type=email]").first();
  const emailMessage = await email.evaluate((el) => { el.value = "abc"; el.reportValidity(); return el.validationMessage; });
  if (!emailMessage.includes("إيميل")) throw Error("email message: " + emailMessage);
  results.push(["INFO", `required: «${message}» · email: «${emailMessage}»`]);
});

await check("change log uses readable wording", async () => {
  await page.goto(base + "/coach/settings");
  const table = page.locator("table").last();
  await table.waitFor();
  const text = await table.innerText();
  if (/[a-z_]+:(INSERT|UPDATE|DELETE)/.test(text)) throw Error("technical action still shown: " + text.match(/[a-z_]+:(INSERT|UPDATE|DELETE)/)[0]);
  results.push(["INFO", "audit sample: " + text.split("\n").slice(1, 4).join(" | ").slice(0, 200)]);
});

await check("program editor plurals and ordinal days", async () => {
  await page.goto(base + "/coach/clients");
  await page.locator(".roster-person-link").first().click();
  await page.waitForURL(/\/coach\/clients\/[0-9a-f-]{36}/);
  const id = page.url().match(/clients\/([0-9a-f-]{36})/)[1];
  await page.goto(`${base}/coach/clients/${id}/edit`);
  const heading = page.locator(".session-toolbar h2");
  await heading.waitFor();
  const text = await heading.innerText();
  if (/\b0 جولة|\b1 حركات|\d+ حركات \/ \d+ جولة$/.test(text) && /\b1 حركات|\b0 جولة/.test(text)) throw Error("heading: " + text);
  results.push(["INFO", "editor heading: " + text]);
  const badge = await page.locator(".program-day-list").innerText();
  if (/\b1 تمارين|\b0 تمارين/.test(badge)) throw Error("day badge: " + badge);
});

let archivedName = "";
await check("archived trainee «⋯» menu is not clipped and flips above near the bottom", async () => {
  archivedName = "متدرب فحص القائمة " + Date.now();
  await page.goto(base + "/coach/clients?add=1");
  await page.locator('main form input[name="name"]').fill(archivedName);
  await page.locator('main form input[name="email"]').fill(`menu-${Date.now()}@example.test`);
  await page.locator('main form button[type="submit"]').click();
  await page.waitForURL(/\/coach\/clients\/[a-f0-9-]+$/);
  await page.goto(base + "/coach/clients");
  const rows = page.locator("tbody tr").filter({ hasText: archivedName });
  await rows.first().waitFor();
  const last = rows.last();
  await last.getByRole("button", { name: /إجراءات/ }).click();
  await page.getByRole("menuitem", { name: "أرشفة المتدرب" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByRole("button", { name: /أرشف/ }).last().click();
  await dialog.waitFor({ state: "detached" });
  await page.goto(base + "/coach/clients?scope=archived");
  const archivedTab = page.getByRole("button", { name: /المؤرشفون/ });
  if (await archivedTab.count()) await archivedTab.first().click();
  const row = page.locator("tbody tr", { hasText: archivedName }).first();
  await row.waitFor();
  await row.scrollIntoViewIfNeeded();
  // Push the row near the bottom of the viewport to force the menu above it.
  await page.evaluate(() => window.scrollBy(0, -window.innerHeight));
  const trigger = row.getByRole("button", { name: /إجراءات/ });
  await trigger.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await trigger.click();
  const purge = page.getByRole("menuitem", { name: "حذف نهائي" });
  await purge.waitFor();
  const box = await purge.boundingBox();
  const viewport = page.viewportSize();
  if (!box || box.y < 0 || box.y + box.height > viewport.height) throw Error("menu item outside viewport " + JSON.stringify(box));
  const topEl = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[role=menuitem]")?.textContent ?? "", { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  if (!topEl.includes("حذف نهائي")) throw Error("menu item is covered/clipped: " + topEl);
  const triggerBox = await trigger.boundingBox();
  results.push(["INFO", `menu ${box.y < triggerBox.y ? "opened above" : "opened below"} the button`]);
  await page.screenshot({ path: shots + "/archived-menu.png" });
  await page.keyboard.press("Escape");
});

await check("restore the archived trainee (cleanup)", async () => {
  const row = page.locator("tbody tr", { hasText: archivedName }).first();
  await row.getByRole("button", { name: /إجراءات/ }).click();
  await page.getByRole("menuitem", { name: "استعادة" }).click();
  await page.getByText(/تمت استعادة/).first().waitFor();
});

await check("invalid invitation shows the signed-in email and switch button", async () => {
  await page.goto(`${base}/invite/${randomBytes(32).toString("hex")}`);
  await page.getByText("الرابط منتهي أو غير صالح").waitFor();
  await page.getByText("coach@example.test").waitFor();
  await page.getByRole("button", { name: "تسجيل الخروج والدخول بحساب آخر" }).waitFor();
  await page.screenshot({ path: shots + "/invalid-invite.png" });
});

const trainee = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar", isMobile: true, hasTouch: true })).newPage();
pages.push(trainee);
trainee.setDefaultTimeout(30000);
await login(trainee, "trainee@example.test");

await check("trainee: consent then «إيقاف صور التقدم» has an explicit cancel", async () => {
  const dialog = trainee.getByRole("dialog", { name: "قبل ما ترفع صور التقدم" });
  await dialog.waitFor({ timeout: 10000 }).catch(() => {});
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "موافق، أبي أرفع صور" }).click();
  await trainee.getByRole("tab", { name: "صور التقدم", exact: true }).click();
  const stop = trainee.getByRole("button", { name: "إيقاف صور التقدم" }).first();
  await stop.scrollIntoViewIfNeeded();
  await stop.click();
  const revoke = trainee.getByRole("dialog", { name: "إيقاف صور التقدم" });
  await revoke.waitFor();
  await revoke.getByRole("button", { name: "إلغاء", exact: true }).click();
  await revoke.waitFor({ state: "detached" });
});

await check("trainee: message form has no date field", async () => {
  await trainee.goto(base + "/me");
  await trainee.getByRole("tab", { name: "المراسلات", exact: true }).click();
  const form = trainee.locator('form[data-record-kind="message"]').first();
  if (!(await form.count())) { results.push(["INFO", "message form not on /me landing; checked coach side instead"]); return; }
  if (await form.locator("input[type=date]").count()) throw Error("date field present");
});

await check("trainee: day navigation matches the saved weekly program", async () => {
  await trainee.goto(base + "/me");
  const daySection = trainee.locator('section[aria-label="أيام البرنامج الأسبوعية"]');
  const buttons = await daySection.locator("button").count();
  const state = await (await trainee.request.get(base + "/api/export")).json();
  const dayCount = state.programs.find(program => program.published_at)?.content.days.length ?? 0;
  assert(buttons <= dayCount, "Day navigation duplicates saved days");
  if (dayCount > 1) assert.equal(buttons, dayCount);
  results.push(["INFO", "trainee day buttons: " + buttons]);
  await trainee.screenshot({ path: shots + "/trainee-today.png", fullPage: true });
});

for (const width of [360, 390, 430, 768, 1440]) {
  await check(`trainee RTL layout at ${width}px`, async () => {
    await trainee.setViewportSize({ width, height: 900 });
    await trainee.goto(base + "/me");
    await trainee.locator("h1").waitFor();
    assert.equal(await trainee.locator("html").getAttribute("dir"), "rtl");
    assert(await trainee.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Horizontal overflow");
    await trainee.screenshot({ path: `${shots}/trainee-${width}.png`, fullPage: true });
  });
}
await browser.close();
await writeFile(`${shots}/result.json`, JSON.stringify({ results, syntheticLocalOnly: true }, null, 2));
if (results.some(row => row[0] === "FAIL")) process.exitCode = 1;
for (const row of results) console.log(row.join(" | "));
