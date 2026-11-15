// Isolated browser QA: synthetic database, merchant and hosted payment only.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { openDatabase, rpcLocal, passwordHash } from "../lib/local-db.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "easycoach-coupon-qa-"));
const base = "http://127.0.0.1:3205";
const merchant = "http://127.0.0.1:4019";
const owner = "77777777-7777-4777-8777-777777777777";
const session = "c".repeat(64);
const db = await openDatabase(path.join(scratch, "db"));
try {
  await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,'coupon@example.test',$2,now())", [owner, passwordHash("FictionalCoupon!2026")]);
  await rpcLocal(db, owner, "init_profile", { display_name: "اختبار الكوبون", requested_role: "coach" });
  await db.exec("update public.ec_config set provider_verified=true,tax_mode='not_registered'");
  await db.query("insert into private.local_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '2 hours')", [createHash("sha256").update(session).digest("hex"), owner]);
} finally { await db.close(); }
let creates = 0;
const provider = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let raw = ""; for await (const chunk of req) raw += chunk;
  if (req.url === "/api/auth") return res.end(JSON.stringify({ id_token: "fictional-token" }));
  if (req.url === "/api/addInvoice") {
    const body = JSON.parse(raw);
    assert.equal(body.amount, 5); assert.equal(body.products[0].price, 5); assert.equal(body.currency, "SAR"); creates++;
    return res.end(JSON.stringify({ success: true, transactionNo: "coupon-browser", url: merchant + "/pay/coupon-browser", orderStatus: "Pending" }));
  }
  if (req.url === "/pay/coupon-browser") { res.setHeader("Content-Type", "text/html"); return res.end("<h1>Synthetic Paylink: SAR 5.00</h1>"); }
  res.statusCode = 404; res.end("{}");
});
await new Promise(resolve => provider.listen(4019, "127.0.0.1", resolve));
const logs = createWriteStream(path.join(scratch, "next.log"));
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", "3205"], { env: { ...process.env, NODE_ENV: "development", LOCAL_DB_PATH: path.join(scratch, "db"), EASYCOACH_EVIDENCE_DIST_DIR: ".next-preview-coupons", APP_URL: base, PAYMENTS_ENABLED: "true", PAYLINK_VERIFIED: "true", PAYLINK_SANDBOX: "true", PAYLINK_BASE_URL: merchant, PAYLINK_API_ID: "fictional-id", PAYLINK_API_SECRET: "fictional-secret", PAYLINK_WEBHOOK_SECRET: "fictional-hook", VAT_REGISTERED: "false", VAT_NUMBER: "", VAT_RATE: "" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
next.stdout.pipe(logs); next.stderr.pipe(logs);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (next.exitCode !== null) throw Error("QA server exited: " + path.join(scratch, "next.log"));
    try { if ((await fetch(base + "/api/session")).status === 401) { ready = true; break; } } catch { /* Still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert(ready, "QA server must start");
  browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: "ec_session", value: session, url: base }]);
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  await page.goto(base + "/subscription/confirm?plan=pro");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "ادفع الفترة الأولى", exact: true }) });
  const code = form.getByLabel("كوبون الخصم", { exact: true });
  await code.fill("invalid"); await form.getByRole("button", { name: "تطبيق الكوبون", exact: true }).click();
  await form.getByText("الكوبون غير صالح أو انتهت صلاحيته.", { exact: true }).waitFor();
  await code.fill("ANHO"); await form.getByRole("button", { name: "تطبيق الكوبون", exact: true }).click();
  await form.getByText("الإجمالي النهائي للدفع: 5.00 ريال", { exact: true }).waitFor();
  assert((await form.innerText()).includes("الحد الأدنى للدفع عبر Paylink هو 5.00"));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/coupon-checkout-mobile.png", fullPage: true });
  await form.getByRole("button", { name: "إزالة", exact: true }).click();
  await form.getByText("الإجمالي النهائي للدفع: 499.00 ريال", { exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await code.fill("anho"); await code.press("Enter");
  await form.getByText("الإجمالي النهائي للدفع: 5.00 ريال", { exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await form.locator('[name="mobile"]').fill("0501234567");
  await form.locator('input[type="checkbox"]').check();
  await form.getByRole("button", { name: "ادفع الفترة الأولى", exact: true }).click();
  await page.waitForURL(merchant + "/pay/coupon-browser");
  assert.equal(creates, 1);
  console.log("PASS: invalid coupon, 99% preview, disclosed SAR 5.00 floor, removal, mobile/desktop, server-priced hosted checkout. Synthetic provider only.");
} finally {
  await browser?.close();
  next.kill();
  await new Promise(resolve => provider.close(resolve));
  logs.end();
}
