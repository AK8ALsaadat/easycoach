// Synthetic-only GoTrue transport fixture. Production uses Supabase Auth, not
// this fixture. No passwords, OTPs or session values are printed or saved.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3219";
assert.equal(new URL(base).hostname, "127.0.0.1");
const users = new Map(), profiles = new Map();
const counts = { signup: 0, verify: 0, resend: 0, profileCreate: 0, snapshot: 0 };
const fixture = { expired: false, resendError: 0 };
const token = user => [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now()/1000) + 3600 })).toString("base64url"), "synthetic-signature",
].join(".");
const session = user => ({ access_token: token(user), refresh_token: "synthetic-refresh", expires_in: 3600, token_type: "bearer", user });
const snapshot = user => ({
  profile: profiles.get(user.id) ?? null,
  clients: [], exercises: [], templates: [], programs: [], subscriptions: [], freezes: [], payments: [], invitations: [], join_requests: [], privacy_requests: [], audit: [], weights: [], client_goals: [], portal_links: [], media_assets: [],
  management: { details: [], records: [], template_metadata: [], import_batches: [], progress_photos: [], preferences: { language: "ar", checkin_days: 7, weight_days: 7, reminders: true, low_adherence: 60 } },
});
const provider = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url, "http://127.0.0.1:4020");
  let body = {}; let raw = ""; for await (const part of req) raw += part;
  if (raw) try { body = JSON.parse(raw); } catch { res.statusCode = 400; return res.end("{}"); }
  const send = (body, status = 200) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (url.pathname === "/auth/v1/signup") {
    counts.signup++;
    const user = { id: randomUUID(), email: body.email, aud: "authenticated", role: "authenticated", user_metadata: body.data, app_metadata: { provider: "email" }, created_at: new Date().toISOString(), email_confirmed_at: null, consumed: false };
    users.set(user.email, user);
    return send({ user, session: null });
  }
  if (url.pathname === "/auth/v1/verify") {
    counts.verify++;
    const user = users.get(body.email);
    if (!user || body.token !== "001234" || user.consumed || fixture.expired) return send({ code: "otp_expired", msg: "Invalid or expired token" }, 403);
    user.email_confirmed_at = new Date().toISOString(); user.consumed = true;
    return send(session(user));
  }
  if (url.pathname === "/auth/v1/resend") {
    counts.resend++;
    if (fixture.resendError) return send({ code: "over_email_send_rate_limit", msg: "Synthetic send failure" }, fixture.resendError);
    return send({});
  }
  let user;
  try { const id = JSON.parse(Buffer.from((req.headers.authorization ?? "").split(".")[1], "base64url").toString()).sub; user = [...users.values()].find(u => u.id === id); } catch {}
  if (url.pathname === "/auth/v1/user") return user ? send(user) : send({ msg: "Unauthenticated" }, 401);
  if (url.pathname === "/auth/v1/logout") { res.statusCode = 204; return res.end(); }
  if (url.pathname === "/auth/v1/token") {
    const found = users.get(body.email);
    if (!found?.email_confirmed_at) return send({ code: "email_not_confirmed", msg: "Email not confirmed" }, 400);
    return send(session(found));
  }
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    if (!user?.email_confirmed_at) return send({ message: "Verified identity required" }, 403);
    if (url.pathname.endsWith("management_snapshot")) { counts.snapshot++; return send(snapshot(user)); }
    if (url.pathname.endsWith("init_profile")) {
      if (!profiles.has(user.id)) { profiles.set(user.id, { id: user.id, email: user.email, name: body.display_name, role: body.requested_role }); counts.profileCreate++; }
      return send(profiles.get(user.id));
    }
    return send([]);
  }
  return send({ message: "Unexpected synthetic endpoint" }, 404);
});
await new Promise(resolve => provider.listen(4020, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
const passed = [];
const pass = text => { passed.push(text); console.log(text); };
async function signup(page, email) {
  await page.goto(base + "/login?register=1"); await page.waitForLoadState("networkidle");
  await page.locator("#auth-name").fill("حساب اختبار اصطناعي");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill("SyntheticTest!2026");
  await page.locator("#auth-password-confirmation").fill("SyntheticTest!2026");
  await page.getByRole("button", { name: "إنشاء حساب", exact: true }).click();
  await page.waitForURL("**/verify-email");
  await page.locator("#signup-otp").waitFor();
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  context.setDefaultTimeout(60000);
  const page = await context.newPage();
  await signup(page, "signup-otp@example.test");
  await page.getByText("signup-otp@example.test", { exact: true }).waitFor();
  assert.equal(counts.profileCreate, 0);
  assert.equal((await page.request.get(base + "/api/export")).url().includes("/login"), true);
  const denied = await context.newPage();
  await denied.goto(base + "/coach"); await denied.waitForURL("**/login"); await denied.close();
  assert.equal(counts.snapshot, 0);
  const pendingCookie = (await context.cookies()).find(c => c.name === "ec_pending_signup");
  assert(pendingCookie.httpOnly);
  assert(!(await context.cookies()).some(c => /auth-token(?:\.\d+)?$/.test(c.name)));
  pass("Signup leads to the intended email/code screen without an authenticated session or protected data");
  await page.reload(); await page.locator("#signup-otp").waitFor();
  await page.getByText("signup-otp@example.test", { exact: true }).waitFor();
  assert(await page.getByRole("button", { name: /إعادة الإرسال بعد/ }).isDisabled());
  assert.equal(await page.locator("#signup-otp").getAttribute("autocomplete"), "one-time-code");
  assert.equal(await page.locator("#signup-otp").getAttribute("inputmode"), "numeric");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: "artifacts/signup-otp-mobile.png", fullPage: true });
  pass("Refresh preserves the email and cooldown; mobile RTL, keyboard field and one-time-code hints work");
  await page.locator("#signup-otp").fill("000000");
  await page.getByRole("button", { name: "تأكيد البريد وفتح الحساب", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "الرمز غير صحيح" }).waitFor();
  fixture.expired = true;
  await page.locator("#signup-otp").fill("001234");
  await page.getByRole("button", { name: "تأكيد البريد وفتح الحساب", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "الرمز غير صحيح" }).waitFor();
  fixture.expired = false;
  pass("Invalid and expired provider responses retain the verification screen and do not initialize a profile");
  // Expire only the synthetic pending timer to exercise resend failure UI quickly.
  // Provider throttling remains authoritative (429 below), even with an edited cookie.
  const pending = JSON.parse(decodeURIComponent(pendingCookie.value)); pending.resendAt = 0;
  await context.addCookies([{ ...pendingCookie, value: encodeURIComponent(JSON.stringify(pending)) }]);
  await page.reload(); await page.locator("#signup-otp").waitFor();
  fixture.resendError = 429;
  await page.getByRole("button", { name: "إعادة إرسال الرمز", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "وصلت إلى حد الإرسال" }).waitFor();
  assert.equal(counts.resend, 1);
  pass("Resend uses signup; a provider 429 is an error and restarts the wait instead of claiming success");
  await page.locator("#signup-otp").evaluate(element => {
    const data = new DataTransfer(); data.setData("text", "٠٠١٢ ٣٤");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  assert.equal(await page.locator("#signup-otp").inputValue(), "001234");
  const before = counts.verify;
  await page.locator("#signup-otp").evaluate(element => { element.form.requestSubmit(); element.form.requestSubmit(); });
  await page.waitForURL("**/coach");
  assert.equal(counts.verify, before + 1);
  assert.equal(counts.profileCreate, 1);
  const sessionCookies = (await context.cookies()).filter(c => c.name.startsWith("sb-"));
  assert(sessionCookies.length > 0 && sessionCookies.every(c => c.httpOnly));
  await page.reload(); await page.locator("h1").first().waitFor();
  assert.equal(counts.profileCreate, 1);
  pass("Arabic paste preserves leading zeros; duplicate submit verifies once; SSR cookies survive refresh and profile initialization is idempotent");
  await page.goto(base + "/login");
  // Exercise a client-side mode switch instead of waiting for dev HMR traffic
  // to become network-idle after returning from an authenticated page.
  await page.getByRole("button", { name: "جديد هنا؟ أنشئ حسابك", exact: true }).click();
  await page.locator("#auth-password-confirmation").waitFor();
  await page.getByRole("button", { name: "عندك حساب؟ ادخل", exact: true }).click();
  await page.locator("#auth-email").fill("signup-otp@example.test");
  await page.locator("#auth-password").fill("SyntheticTest!2026");
  await page.locator('button[type="submit"]').click(); await page.waitForURL("**/coach");
  assert.equal(counts.profileCreate, 1);
  pass("Existing email/password sign-in remains functional after verification");
  const second = await browser.newContext({ viewport: { width: 390, height: 900 } });
  second.setDefaultTimeout(60000);
  const other = await second.newPage();
  await signup(other, "signup-correct@example.test");
  await other.getByRole("button", { name: "الرجوع لتصحيح البريد", exact: true }).click();
  await other.waitForURL("**/login?register=1");
  await other.locator("#auth-password-confirmation").waitFor();
  assert(!(await second.cookies()).some(c => c.name === "ec_pending_signup"));
  assert.equal(await other.locator("#auth-password").inputValue(), "");
  pass("Correcting email restarts registration, clears pending metadata and never carries a password forward");
  const mail = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await mail.setContent((await readFile("supabase/templates/EasyCoach_OTP_Email.html", "utf8")).replace("{{ .Token }}", "000000"));
  await mail.locator("img").evaluate(async img => { if (!img.complete) await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; }); });
  assert(await mail.locator("img").evaluate(img => img.naturalWidth === 512 && img.naturalHeight === 512));
  assert(await mail.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mail.screenshot({ path: "artifacts/signup-email-preview-mobile.png", fullPage: true });
  pass("Final table email renders on mobile and loads the public 512×512 PNG without a session");
  await writeFile("artifacts/signup-otp-browser-result.json", JSON.stringify({ syntheticProvider: true, passed, counts }, null, 2));
} finally { await browser.close(); await new Promise(resolve => provider.close(resolve)); }
