import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL;
assert.equal(new URL(base).hostname, "127.0.0.1");
assert.equal(process.env.QA_OPERATOR_TAX_FIXTURE, "true");
const orders = new Map();
let creates = 0;
const provider = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  const url = new URL(request.url, "http://127.0.0.1:4017");
  let raw = ""; for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  if (url.pathname === "/api/auth") return response.end(JSON.stringify({ id_token: "fictional-provider-token" }));
  if (url.pathname === "/api/addInvoice") {
    assert.equal(body.amount, 573.85); assert.equal(body.currency, "SAR");
    assert.equal(body.clientEmail, "free@example.test");
    assert(new URL(body.callBackUrl).pathname === "/subscription");
    const transactionNo = `fictional-${++creates}`;
    orders.set(transactionNo, { ...body, paid: false });
    return response.end(JSON.stringify({ success: true, transactionNo, url: `http://127.0.0.1:4017/pay/${transactionNo}`, orderStatus: "Pending" }));
  }
  if (url.pathname.startsWith("/api/getInvoice/")) {
    const transactionNo = url.pathname.split("/").at(-1), invoice = orders.get(transactionNo);
    assert(invoice);
    return response.end(JSON.stringify({ transactionNo, amount: invoice.amount, orderStatus: invoice.paid ? "Paid" : "Pending", gatewayOrderRequest: { orderNumber: invoice.orderNumber, currency: "SAR" }, paymentReceipt: invoice.paid ? { paymentDate: invoice.paidAt, paymentMethod: "MADA" } : null, paymentErrors: [] }));
  }
  if (url.pathname.startsWith("/pay/")) {
    response.setHeader("Content-Type", "text/html");
    return response.end("<h1>Synthetic hosted payment</h1>");
  }
  response.statusCode = 404; response.end("{}");
});
await new Promise(resolve => provider.listen(4017, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
async function login(email) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();page.setDefaultTimeout(60000);
  await page.goto(base + "/login");await page.waitForLoadState("networkidle");
  await page.locator("#auth-email").fill(email);await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator('button[type="submit"]').click();await page.waitForURL("**/coach");
  return page;
}
try {
  const page = await login("free@example.test");
  await page.goto(base + "/subscription/confirm?plan=pro");
  const facts = await page.locator(".confirm-facts").innerText();
  assert(facts.includes("74.85") && facts.includes("573.85"));
  const pay = page.getByRole("button", { name: "ادفع الفترة الأولى", exact: true });
  await pay.waitFor();
  assert(await page.getByRole("button", { name: "ابدأ 14 يومًا مجانًا الآن", exact: true }).isVisible());
  const form = page.locator("form").filter({ has: pay });
  await form.locator('[name="mobile"]').fill("0501234567");
  await form.locator('input[type="checkbox"]').check();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pay.click();await page.waitForURL("http://127.0.0.1:4017/pay/**");
  assert.equal(creates, 1);
  const invoice = orders.get("fictional-1");
  const notify = () => fetch(base + "/api/payments/paylink/webhook", { method: "POST", headers: { authorization: "Bearer qa-local-webhook", "Content-Type": "application/json" }, body: JSON.stringify({ transactionNo: "fictional-1", merchantOrderNumber: invoice.orderNumber, apiVersion: "v2", orderStatus: "Paid", amount: 1 }) });
  assert.equal((await notify()).status, 200);
  await page.goto(base + "/subscription");
  await page.getByRole("heading", { name: "بانتظار سداد الفترة", exact: true }).waitFor();
  invoice.paid = true;invoice.paidAt = new Date().toISOString();
  assert.deepEqual((await Promise.all([notify(), notify()])).map(r => r.status), [200, 200]);
  await page.goto(invoice.callBackUrl);
  await page.getByText("تم تأكيد الدفع وتفعيل اشتراكك.", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "الاشتراك نشط", exact: true }).waitFor();
  await page.reload();await page.getByRole("heading", { name: "الاشتراك نشط", exact: true }).waitFor();
  const trial = await login("trial@example.test");
  await trial.goto(base + "/subscription/confirm?plan=pro");
  await trial.locator('.trial-confirm-form [name="mobile"]').fill("0501234567");
  await trial.locator('.trial-confirm-form [name="terms_acceptance"]').check();
  await trial.getByRole("button", { name: "ابدأ 14 يومًا مجانًا الآن", exact: true }).click();
  await trial.waitForURL("**/coach?trial=started");
  await trial.goto(base + "/subscription");
  await trial.getByRole("heading", { name: "التجربة نشطة", exact: true }).waitFor();
  assert.equal(creates, 1, "Starting a trial must not create a paid invoice");
  console.log("PASS: 499.00 + 74.85 = 573.85, visible choices, hosted checkout, server verification, replayed webhook, separate card-less trial. Synthetic provider only.");
} finally { await browser.close();await new Promise(resolve => provider.close(resolve)); }
