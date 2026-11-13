// Isolated local-only checks; fragments/cookies are never included in reports.
import { ensurePhotoConsent } from "./photo-consent-helper.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3217";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = path.resolve("artifacts/personal-link-check"); await mkdir(out, { recursive: true });
process.env.TEMP = out; process.env.TMP = out;
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
const passes = [], errors = [];
const pass = text => { passes.push(text); console.log(text); };
const redact = text => String(text).replace(/[a-f0-9]{64}/g, "[credential redacted]");
async function context(width = 390) { const c = await browser.newContext({ viewport: { width, height: 900 } }); c.setDefaultTimeout(20000); c.setDefaultNavigationTimeout(60000); return c; }
async function snapshot(page) { const r = await page.request.get(base + "/api/export"); assert.equal(r.status(), 200); return r.json(); }
async function until(fn, message) { for (let i = 0; i < 40; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 250)); } throw Error(message); }
let coach;
async function createClient(name, index) {
  await coach.goto(base + "/coach/clients?add=1");
  await coach.locator('main form input[name="name"]').fill(name);
  await coach.locator('main form input[name="email"]').fill(`personal-${Date.now()}-${index}@example.test`);
  await coach.locator('main form input[name="phone"]').fill("0501234567");
  await coach.locator('main form button[type="submit"]').click(); await coach.waitForURL(/\/coach\/clients\/[a-f0-9-]+$/);
  return coach.url().split("/").at(-1);
}
async function linkFor(id) {
  await coach.goto(base + `/coach/clients/${id}?tab=profile`);
  await coach.getByRole("button", { name: /إنشاء رابط دخول للمتدرب|تجديد رابط الدخول/ }).click();
  return coach.getByLabel("رابط العميل الخاص").inputValue();
}
async function openLink(link) {
  const c = await context(); const page = await c.newPage();
  page.on("pageerror", error => errors.push(redact(error.message)));
  const requests = []; page.on("request", r => requests.push(r.url()));
  const raw = new URL(link).hash.slice(1);
  await page.goto(link); await page.waitForURL(/\/trainee\/[a-f0-9-]+$/); await page.locator(".client-portal").waitFor();
  assert(!page.url().includes(raw)); assert(!page.url().includes("#"));
  assert(requests.every(url => !url.includes(raw)));
  assert.equal(await page.getByLabel("رمز دخول العميل").count(), 0);
  assert.equal(await page.locator("#auth-password").count(), 0);
  assert((await c.cookies()).filter(cookie => cookie.name.startsWith("ec_trainee_")).every(cookie => cookie.httpOnly && cookie.sameSite === "Strict"));
  return { c, page };
}
try {
  const cc = await context(1440); coach = await cc.newPage(); coach.on("dialog", d => d.accept());
  await coach.goto(base + "/login"); await coach.locator("#auth-email").fill("coach@example.test"); await coach.locator("#auth-password").fill("CoachPreview!2026"); await coach.locator("button[type=submit]").click(); await coach.waitForURL("**/coach");
  const stamp = Date.now(), aName = "متدربأ" + stamp, bName = "متدربب" + stamp;
  const aId = await createClient(aName, 1), bId = await createClient(bName, 2);
  const aLink = await linkFor(aId), bLink = await linkFor(bId);
  const a = await openLink(aLink), b = await openLink(bLink);
  await a.page.locator(".portal-welcome").getByText(aName, { exact: false }).waitFor();
  assert(!(await a.page.locator("main").innerText()).includes(bName)); assert(!(await b.page.locator("main").innerText()).includes(aName));
  pass("two personal links open separate trainee records without account or PIN; bearer removed from URL and requests");
  const aside = a.page.locator("aside").first();
  await aside.getByLabel("الوزن بالكيلوجرام").fill("79.3");
  await aside.getByRole("button", { name: /^(تسجيل|تصحيح الوزن)$/ }).click();
  await until(async () => (await snapshot(coach)).weights.some(w => w.client_id === aId && Number(w.weight) === 79.3), "Weight not persisted");
  const a2 = await openLink(aLink); assert((await a2.page.locator("main").innerText()).includes("79.3"));
  pass("weight-only update persists and is visible in an independent browser session");
  await a.page.getByRole("tab", { name: "صور التقدم", exact: true }).click();
  const image = await sharp({ create: { width: 100, height: 150, channels: 3, background: "#4f81b7" } }).jpeg().toBuffer();
  await ensurePhotoConsent(a.page);
  await a.page.getByLabel("صورة تقدم خاصة", { exact: true }).setInputFiles({ name: "synthetic.jpg", mimeType: "image/jpeg", buffer: image });
  await a.page.getByRole("button", { name: "استبدال", exact: true }).waitFor();
  const [replacementChooser] = await Promise.all([a.page.waitForEvent("filechooser"), a.page.getByRole("button", { name: "استبدال", exact: true }).click()]);
  await replacementChooser.setFiles({ name: "replacement.jpg", mimeType: "image/jpeg", buffer: image });
  await a.page.getByText("replacement.webp", { exact: true }).waitFor();
  assert.equal(await a.page.locator('input[type=file][capture="environment"]').count(), 3);
  await a.page.getByRole("button", { name: "رفع صورة", exact: true }).click();
  await a.page.getByRole("status").filter({ hasText: "تم حفظ الصور" }).waitFor();
  const photo = (await snapshot(coach)).management.progress_photos.find(p => p.client_id === aId);
  assert(photo);
  const src = await a.page.locator(".progress-photo-timeline-image img").first().getAttribute("src");
  assert(src.includes("variant=thumbnail"));
  const thumbnail = await a.page.request.get(base + src); assert.equal(thumbnail.status(), 200);
  assert.equal((await b.page.request.get(base + src)).status(), 404);
  assert.equal((await a.page.request.get(base + `/api/progress-photos/${photo.id}`)).status(), 404);
  pass("session-scoped private photo upload and thumbnail work; another trainee and uncredentialed file URL are denied");
  await a.page.getByRole("button", { name: "ربط حساب اختياري", exact: true }).click();
  await a.page.waitForURL(/\/invite\/[a-f0-9]+$/);
  await a.page.getByRole("link", { name: "سجّل الدخول بنفس إيميل الدعوة", exact: true }).click();
  await a.page.waitForURL(/\/login\?next=/);
  assert(new URL(a.page.url()).searchParams.get("next").startsWith("/invite/"));
  pass("account linking is a separate optional verified-invitation path; real email confirmation is not exercised in local mode");
  await a2.c.setOffline(true); await a2.page.getByRole("button", { name: "تحديث الجدول", exact: true }).click();
  await a2.page.getByText("تعذر الاتصال. بياناتك المدخلة ما زالت هنا", { exact: false }).waitFor();
  assert.equal(await a2.page.locator(".client-portal").count(), 1); await a2.c.setOffline(false);
  await coach.goto(base + `/coach/clients/${aId}?tab=profile`); await coach.getByRole("button", { name: "إيقاف الرابط", exact: true }).click();
  await a2.page.getByRole("button", { name: "تحديث الجدول", exact: true }).click(); await a2.page.locator(".portal-gate").waitFor();
  assert(!(await a2.page.locator("main").innerText()).includes(aName));
  assert.equal((await a2.page.request.get(base + src)).status(), 404);
  pass("offline updates retain the open portal; revocation invalidates derived sessions and direct private media access");
  const replacement = await linkFor(aId); const fresh = await openLink(replacement);
  await fresh.page.locator(".portal-welcome").getByText(aName, { exact: false }).waitFor();
  const old = await context(); const oldPage = await old.newPage(); await oldPage.goto(aLink);
  assert.equal(await oldPage.locator(".client-portal").count(), 0);
  await fresh.page.screenshot({ path: out + "/trainee-mobile.png", fullPage: true });
  assert(await fresh.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const csrf = await fresh.c.request.post(base + "/api/portal-session", { headers: { Origin: "https://attacker.example" }, data: { id: new URL(replacement).pathname.split("/").at(-1), token: new URL(replacement).hash.slice(1) } }); assert.equal(csrf.status(), 403);
  pass("regeneration rejects the old credential; mobile RTL has no overflow; session exchange rejects cross-origin requests");
  assert.deepEqual(errors, []);
  await writeFile(out + "/result.json", JSON.stringify({ passes, errors, localSyntheticOnly: true }, null, 2));
} catch (error) { await writeFile(out + "/result.json", JSON.stringify({ passes, failure: redact(error), localSyntheticOnly: true }, null, 2)); throw Error(redact(error)); }
finally { await browser.close(); }
