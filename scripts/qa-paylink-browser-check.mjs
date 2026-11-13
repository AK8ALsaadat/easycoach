// Local synthetic integration: real Next routes + database, loopback Paylink simulator.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3217";
assert.equal(new URL(base).hostname, "127.0.0.1");
const invoices = new Map();
let seq = Date.now() * 10;
let loseNextCreateResponse = false;
const simulator = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/auth") return res.end(JSON.stringify({ id_token: "local-synthetic-token" }));
  if (req.url === "/api/addInvoice") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body), tx = String(++seq);
    invoices.set(tx, { transactionNo: tx, orderStatus: "Pending", amount: data.amount, gatewayOrderRequest: { orderNumber: data.orderNumber, currency: data.currency }, paymentErrors: [] });
    await new Promise(resolve => setTimeout(resolve, 150));
    if (loseNextCreateResponse) { loseNextCreateResponse = false; return req.socket.destroy(); }
    return res.end(JSON.stringify({ success: true, transactionNo: tx, url: `http://127.0.0.1:4017/pay/${tx}` }));
  }
  const invoice = invoices.get(req.url?.split("/").at(-1));
  if (!invoice) { res.statusCode = 404; return res.end("{}"); }
  res.end(JSON.stringify(invoice));
});
await new Promise(resolve => simulator.listen(4017, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
const passed = [];
let lastPage;
async function login(email) {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `qa-local-${crypto.randomUUID()}` } });
  context.setDefaultTimeout(60000);
  const page = await context.newPage();
  lastPage = page;
  await page.goto(base + "/login");
  await page.waitForLoadState("networkidle");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill("CoachPreview!2026");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(email.startsWith("trainee") ? "**/me" : "**/coach");
  await page.waitForLoadState("networkidle");
  console.log("Signed in to synthetic local account");
  return page;
}
async function snapshot(page) {
  const res = await page.request.get(base + "/api/export");
  assert.equal(res.status(), 200);
  return res.json();
}
const shift = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
try {
  const coach = await login("coach@example.test");
  const data = await snapshot(coach);
  const client = data.clients.find(c => c.email === "trainee@example.test");
  const start = shift(data.subscriptions.filter(s => s.client_id === client.id).map(s => s.end_date).sort().at(-1), 1);
  await coach.goto(`${base}/coach/clients/${client.id}?tab=finance`, { waitUntil: "domcontentloaded" });
  await coach.waitForLoadState("networkidle");
  await coach.getByRole("button", { name: "تجديد الاشتراك", exact: true }).click();
  const dialog = coach.getByRole("dialog");
  await dialog.getByLabel("قيمة الاشتراك (ر.س)", { exact: true }).fill("100");
  const save = dialog.getByRole("button", { name: "تأكيد التجديد", exact: true });
  assert(await save.isEnabled(), "Valid numeric subscription price must enable saving");
  await save.click();
  await dialog.waitFor({ state: "hidden" });
  const sub = (await snapshot(coach)).subscriptions.find(s => s.client_id === client.id && s.start_date === start);
  assert(sub);
  const trainee = await login("trainee@example.test");
  const other = await login("coach2@example.test");
  const checkout = page => page.request.post(base + "/api/payments/paylink/checkout", { headers: { origin: base }, data: { subscription_id: sub.id } });
  assert.equal((await checkout(other)).status(), 404);
  assert.equal((await trainee.request.post(base + "/api/payments/paylink/checkout", { headers: { origin: "https://attacker.example" }, data: { subscription_id: sub.id } })).status(), 403);
  assert.equal(invoices.size, 0);
  passed.push("Other coach and cross-origin checkout rejected without remote invoice or ledger change");
  const simultaneous = await Promise.all([checkout(trainee), checkout(trainee)]);
  assert.equal(simultaneous.filter(r => r.status() === 200).length, 1);
  assert.equal(invoices.size, 1);
  passed.push("Two concurrent checkout requests created exactly one remote invoice");
  const [tx, invoice] = [...invoices][0];
  const order = invoice.gatewayOrderRequest.orderNumber;
  const webhook = (secret = "qa-local-webhook") => trainee.request.post(base + "/api/payments/paylink/webhook", { headers: { authorization: `Bearer ${secret}` }, data: { transactionNo: tx, merchantOrderNumber: order, orderStatus: "Paid" } });
  assert.equal((await webhook("wrong")).status(), 401);
  assert.equal((await webhook()).status(), 200);
  const payments = async () => (await snapshot(coach)).payments.filter(p => p.subscription_id === sub.id);
  assert.equal((await payments()).length, 0);
  passed.push("Forged paid webhook and invalid secret cannot create a payment");
  invoice.orderStatus = "Paid";
  invoice.gatewayOrderRequest.currency = "USD";
  assert.equal((await webhook()).status(), 500);
  assert.equal((await payments()).length, 0);
  invoice.gatewayOrderRequest.currency = "SAR";
  invoice.gatewayOrderRequest.orderNumber = null;
  assert.equal((await webhook()).status(), 500);
  assert.equal((await payments()).length, 0);
  invoice.gatewayOrderRequest.orderNumber = order;
  const confirmed = await Promise.all([webhook(), webhook()]);
  assert(confirmed.every(r => r.status() === 200));
  assert.equal((await payments()).length, 1);
  assert.equal(Number((await payments())[0].amount), 100);
  invoice.orderStatus = "Canceled";
  assert.equal((await webhook()).status(), 200);
  const finalPayments = await payments();
  assert.equal(finalPayments.length, 1);
  passed.push("Missing order rejected; verified concurrent webhooks produced one 100 SAR database payment; late cancellation preserved it");
  const recoveryStart = shift((await snapshot(coach)).subscriptions.filter(s => s.client_id === client.id).map(s => s.end_date).sort().at(-1), 1);
  await coach.goto(`${base}/coach/clients/${client.id}?tab=finance`);
  await coach.waitForLoadState("networkidle");
  await coach.getByRole("button", { name: "تجديد الاشتراك", exact: true }).click();
  const renewal = coach.getByRole("dialog");
  await renewal.getByLabel("قيمة الاشتراك (ر.س)", { exact: true }).fill("100");
  await renewal.getByRole("button", { name: "تأكيد التجديد", exact: true }).click();
  await renewal.waitFor({ state: "hidden" });
  const recoverySub = (await snapshot(coach)).subscriptions.find(s => s.client_id === client.id && s.start_date === recoveryStart);
  assert(recoverySub);
  loseNextCreateResponse = true;
  const recoveryCheckout = () => trainee.request.post(base + "/api/payments/paylink/checkout", { headers: { origin: base }, data: { subscription_id: recoverySub.id } });
  assert.equal((await recoveryCheckout()).status(), 409);
  assert.equal((await recoveryCheckout()).status(), 409);
  assert.equal(invoices.size, 2);
  const [recoveryTx, recoveryInvoice] = [...invoices].at(-1);
  recoveryInvoice.orderStatus = "Paid";
  const recover = () => trainee.request.post(base + "/api/payments/paylink/webhook", { headers: { authorization: "Bearer qa-local-webhook" }, data: { transactionNo: recoveryTx, merchantOrderNumber: recoveryInvoice.gatewayOrderRequest.orderNumber } });
  assert.equal((await recover()).status(), 200);
  assert.equal((await recover()).status(), 200);
  const recoveryPayments = (await snapshot(coach)).payments.filter(p => p.subscription_id === recoverySub.id);
  assert.equal(recoveryPayments.length, 1);
  assert.equal(Number(recoveryPayments[0].amount), 100);
  passed.push("Lost addInvoice response leaves one reserved invoice; retry creates none; verified webhook recovers and settles exactly once in the database");
  await trainee.reload();
  await trainee.screenshot({ path: "artifacts/qa-paylink-trainee.png", fullPage: true });
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/qa-paylink-integration.json", JSON.stringify({ syntheticLocalOnly: true, passed, remoteInvoices: invoices.size, databasePayments: [...finalPayments, ...recoveryPayments] }, null, 2));
  console.log(passed.join("\n"));
} catch (error) {
  await lastPage?.screenshot({ path: "artifacts/qa-paylink-failure.png", fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => simulator.close(resolve));
}
