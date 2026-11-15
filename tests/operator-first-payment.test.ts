import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { coach, other, fixtureDatabase } from "./helpers/db";
import { POLICY_VERSION } from "@/lib/legal";

const mock = vi.hoisted(() => ({ call: vi.fn(), actor: vi.fn(), rpc: vi.fn(), auth: vi.fn(), create: vi.fn(), get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/platform/billing-store", () => ({ billingCall: mock.call }));
vi.mock("@/lib/server", () => ({ actor: mock.actor, rpc: mock.rpc }));
vi.mock("@/components/trial-start-form", () => ({ TrialStartForm: () => createElement("button", null, "ابدأ التجربة") }));
vi.mock("@/lib/paylink/client", async original => ({ ...await original<typeof import("@/lib/paylink/client")>(), createPaylinkClient: () => ({ auth: mock.auth, createInvoice: mock.create, getInvoice: mock.get }) }));
import { paymentReadiness } from "@/lib/platform/payment-config";
import { SubscriptionPurchaseOptions } from "@/components/subscription-purchase-options";
import { POST as createInvoice } from "@/app/api/payments/paylink/create-invoice/route";
import { POST as webhook } from "@/app/api/payments/paylink/webhook/route";

let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
let order: string;
const url = "https://paylink.sa/fictional-first-period";
const paidAt = new Date().toISOString();
beforeAll(async () => {
  fx = await fixtureDatabase({ platformManaged: true });
  for (const [key, value] of Object.entries({ PAYMENTS_ENABLED: "true", PAYLINK_VERIFIED: "true", PAYLINK_SANDBOX: "true", PAYLINK_BASE_URL: "https://restpilot.paylink.sa", PAYLINK_API_ID: "fictional-id", PAYLINK_API_SECRET: "fictional-api-secret", PAYLINK_WEBHOOK_SECRET: "fictional-hook", APP_URL: "https://easycoach.test", VAT_NUMBER: "", VAT_RATE: "" })) vi.stubEnv(key, value);
  mock.actor.mockResolvedValue({ id: coach, email: "owner@example.test", name: "Test owner" });
  mock.rpc.mockImplementation((name: string) => fx.call(coach, name));
  mock.call.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    const entries = Object.entries(args);
    return (await fx.db.query<{ r: unknown }>(`select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(",")}) as r`, entries.map(([, value]) => value !== null && typeof value === "object" ? JSON.stringify(value) : value))).rows[0].r;
  });
  mock.auth.mockResolvedValue("fictional-token");
  mock.create.mockImplementation(async (input: { orderNumber: string }) => { order = input.orderNumber; return { transactionNo: "first-payment", url }; });
  mock.get.mockImplementation(async () => ({ transactionNo: "first-payment", orderNumber: order, currency: "SAR", orderStatus: "Pending", rawStatus: "Pending", amount: 573.85, paidAt, paymentErrors: [] }));
});
afterAll(async () => { vi.unstubAllEnvs(); await fx?.db.close(); });
const request = (total = 57385) => new Request("https://easycoach.test/api/payments/paylink/create-invoice", { method: "POST", headers: { origin: "https://easycoach.test", host: "easycoach.test", "Content-Type": "application/json" }, body: JSON.stringify({ plan: "pro", total, mobile: "0501234567", terms: POLICY_VERSION }) });
const options = async (total: number | null) => renderToStaticMarkup(createElement(SubscriptionPurchaseOptions, { plan: "pro", total, trialAvailable: true, trialDays: 14, canPay: true, readiness: await paymentReadiness() }));

it("hides payment and trial submit buttons while the operator tax registration is missing", async () => {
  const html = await options(null);
  expect(html).toContain("لم تُحدد إعدادات التسجيل الضريبي للمشغّل");
  expect(html).not.toContain("<button");
  expect((await createInvoice(request())).status).toBe(503);
  expect(mock.create).not.toHaveBeenCalled();
  expect((await fx.db.query<{ tax_configured: boolean }>("select tax_configured from public.ec_config")).rows[0].tax_configured).toBe(false);
});
it("requires a real configured registration number and computes VAT using integer halalas", async () => {
  await fx.db.exec("update public.ec_config set tax_mode='exclusive',tax_bps=1500");
  expect(await fx.call(coach, "ec_quote", { plan_code: "pro" })).toMatchObject({ total_halalas: null });
  await fx.db.query("select public.ec_billing_operator_config($1,1500,true)", ["300000000000003"]);
  expect(await fx.call(coach, "ec_quote", { plan_code: "pro" })).toMatchObject({ net_halalas: 49900, vat_halalas: 7485, total_halalas: 57385 });
  await expect(fx.call(coach, "ec_billing_operator_config", { registration_number: "300000000000003", vat_basis_points: 1500, approve_provider: true })).rejects.toThrow(/permission denied/);
});
it("hides both submit buttons when PAYLINK_VERIFIED is false and rejects direct API calls", async () => {
  vi.stubEnv("PAYLINK_VERIFIED", "false");
  const html = await options(57385);
  expect(html).toContain("Paylink غير معتمد"); expect(html).not.toContain("<button");
  expect((await createInvoice(request())).status).toBe(503);
  expect(mock.create).not.toHaveBeenCalled();
  vi.stubEnv("PAYLINK_VERIFIED", "true");
});
it("shows both choices when ready and rejects a tampered client total", async () => {
  const html = await options(57385);
  expect(html).toContain("ادفع الفترة الأولى"); expect(html).toContain("ابدأ التجربة");
  expect((await createInvoice(request(49900))).status).toBe(409);
  expect(mock.create).not.toHaveBeenCalled();
  expect((await fx.db.query<{ billing_first_due_at: string | null }>("select billing_first_due_at from public.ec_accounts where owner_id=$1", [coach])).rows[0].billing_first_due_at).toBeNull();
});
it("creates one direct-purchase invoice without requiring a trial or granting paid access", async () => {
  const response = await createInvoice(request()); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, url });
  expect(mock.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ amount: 573.85, clientEmail: "owner@example.test", orderNumber: expect.stringMatching(/^ECP-[a-f0-9]{32}$/), callBackUrl: expect.stringContaining("https://easycoach.test/subscription?payment=return&orderNumber=") }));
  expect(await fx.call(coach, "ec_subscription")).toMatchObject({ subscription_state: "AWAITING_PAYMENT", effective_plan: "free", trial_used_at: null, paid_until: null, has_payment_method: false });
  expect(await fx.call(coach, "ec_quote", { plan_code: "pro" })).toMatchObject({ trial_available: false });
  await expect(fx.db.query("select public.ec_billing_start($1,'pro','0501234567','Test owner',$2)", [coach, POLICY_VERSION])).rejects.toThrow(/trial_used/);
  expect((await createInvoice(request())).status).toBe(200);
  expect(mock.create).toHaveBeenCalledTimes(1);
  expect((await fx.db.query("select id from public.ec_invoices")).rows).toHaveLength(1);
});
it("quarantines a server-verified invoice whose paid amount does not match the VAT-inclusive total", async () => {
  const owner = crypto.randomUUID();
  await fx.db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at)values($1,'amount-mismatch@example.test','fictional-unused-password',now())", [owner]);
  await fx.call(owner, "init_profile", { display_name: "Mismatch fixture", requested_role: "coach" });
  await fx.db.query("select public.ec_billing_contact($1,'0501234567','Mismatch fixture')", [owner]);
  const attempt = (await fx.db.query<{ r: { id: string; order_no: string } }>("select public.ec_billing_prepare($1,'pro',57385) as r", [owner])).rows[0].r;
  await fx.db.query("select public.ec_billing_attach($1,'amount-mismatch','https://paylink.sa/fictional-mismatch')", [attempt.id]);
  mock.get.mockResolvedValueOnce({ transactionNo: "amount-mismatch", orderNumber: attempt.order_no, currency: "SAR", orderStatus: "Paid", rawStatus: "Paid", amount: 499, paidAt, paymentErrors: [] });
  const response = await webhook(new Request("https://easycoach.test/api/payments/paylink/webhook", { method: "POST", headers: { authorization: "Bearer fictional-hook" }, body: JSON.stringify({ transactionNo: "amount-mismatch", merchantOrderNumber: attempt.order_no, apiVersion: "v2" }) }));
  expect(response.status).toBe(200);
  expect(await fx.call(owner, "ec_subscription")).toMatchObject({ paid_until: null, effective_plan: "free" });
  expect((await fx.db.query<{ status: string }>("select status from public.ec_invoices where owner_id=$1", [owner])).rows[0].status).toBe("review");
});
it("verifies webhook v2 with Get Invoice and activates the VAT-inclusive period only once", async () => {
  const notify = () => new Request("https://easycoach.test/api/payments/paylink/webhook", { method: "POST", headers: { authorization: "Bearer fictional-hook" }, body: JSON.stringify({ apiVersion: "v2", transactionNo: "first-payment", merchantOrderNumber: order, orderStatus: "Paid", amount: 1 }) });
  expect((await webhook(notify())).status).toBe(200);
  expect(await fx.call(coach, "ec_subscription")).toMatchObject({ effective_plan: "free", paid_until: null });
  mock.get.mockResolvedValue({ transactionNo: "first-payment", orderNumber: order, currency: "SAR", orderStatus: "Paid", rawStatus: "Paid", amount: 573.85, paidAt, paymentErrors: [] });
  expect((await Promise.all([webhook(notify()), webhook(notify())])).map(r => r.status)).toEqual([200, 200]);
  const state = await fx.call<{ paid_until: string }>(coach, "ec_subscription");
  expect(await fx.call(coach, "ec_subscription")).toMatchObject({ subscription_state: "ACTIVE", effective_plan: "pro" });
  expect(Date.parse(state.paid_until)).toBe(Date.parse(paidAt) + 30 * 86400000);
  await webhook(notify()); expect((await fx.call(coach, "ec_subscription")).paid_until).toBe(state.paid_until);
});
it("starts a 14-day Business trial separately with no paid invoice or saved card", async () => {
  await fx.db.query("select public.ec_billing_start($1,'pro','0501234567','Trial owner',$2)", [other, POLICY_VERSION]);
  expect(await fx.call(other, "ec_subscription")).toMatchObject({ subscription_state: "TRIAL_ACTIVE", effective_plan: "business", paid_until: null, has_payment_method: false });
  expect((await fx.db.query<{ seconds: number }>("select extract(epoch from trial_end-trial_start)::int as seconds from public.ec_accounts where owner_id=$1", [other])).rows[0].seconds).toBe(14 * 86400);
  expect((await fx.db.query("select id from public.ec_invoices where owner_id=$1", [other])).rows).toHaveLength(0);
  expect(mock.create).not.toHaveBeenCalled();
});
