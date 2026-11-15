import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { coach, fixtureDatabase } from "./helpers/db";
import { POLICY_VERSION } from "@/lib/legal";

const mock = vi.hoisted(() => ({ call: vi.fn(), actor: vi.fn(), rpc: vi.fn(), auth: vi.fn(), create: vi.fn(), get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/platform/billing-store", () => ({ billingCall: mock.call }));
vi.mock("@/lib/server", () => ({ actor: mock.actor, rpc: mock.rpc }));
vi.mock("@/lib/paylink/client", async original => ({ ...await original<typeof import("@/lib/paylink/client")>(), createPaylinkClient: () => ({ auth: mock.auth, createInvoice: mock.create, getInvoice: mock.get }) }));
import { paymentReadiness } from "@/lib/platform/payment-config";
import { GET as health } from "@/app/api/health/payments/route";
import { POST as createInvoice } from "@/app/api/payments/paylink/create-invoice/route";
import { POST as webhook } from "@/app/api/payments/paylink/webhook/route";

let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
let order = "";
const paidAt = new Date().toISOString();
const env = { PAYMENTS_ENABLED: "false", PAYLINK_VERIFIED: "false", PAYLINK_SANDBOX: "false", PAYLINK_BASE_URL: "https://restapi.paylink.sa", PAYLINK_API_ID: "fictional-live-id", PAYLINK_API_SECRET: "fictional-live-secret-value", PAYLINK_WEBHOOK_SECRET: "fictional-hook-value", CRON_SECRET: "fictional-operator-check", APP_URL: "https://easycoach.test", VAT_REGISTERED: "false", VAT_NUMBER: "", VAT_RATE: "" };
const events = async () => (await fx.db.query<{ source: string; status: string; invoice_id: string | null; amount_halalas: number | null; provider_amount_halalas: number | null; occurrences: number; request_id: string | null }>("select source,status,invoice_id,amount_halalas,provider_amount_halalas,occurrences,request_id from private.payment_events order by id")).rows;
const check = (token?: string) => health(new Request("https://easycoach.test/api/health/payments", { headers: token ? { authorization: `Bearer ${token}` } : {} }));

beforeAll(async () => {
  fx = await fixtureDatabase({ platformManaged: true });
  mock.actor.mockResolvedValue({ id: coach, email: "owner@example.test", name: "Test owner" });
  mock.rpc.mockImplementation((name: string, args?: Record<string, unknown>) => fx.call(coach, name, args));
  mock.call.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    const entries = Object.entries(args);
    return (await fx.db.query<{ r: unknown }>(`select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(",")}) as r`, entries.map(([, value]) => value !== null && typeof value === "object" ? JSON.stringify(value) : value))).rows[0].r;
  });
  mock.auth.mockResolvedValue("fictional-token");
  mock.create.mockImplementation(async (input: { orderNumber: string }) => { order = input.orderNumber; return { transactionNo: "launch-payment", url: "https://paylink.sa/fictional-launch" }; });
  mock.get.mockImplementation(async () => ({ transactionNo: "launch-payment", orderNumber: order, currency: "SAR", orderStatus: "Paid", rawStatus: "Paid", amount: 499, paidAt, paymentErrors: [] }));
  await fx.db.exec("update public.ec_config set provider_verified=true,tax_mode='unconfigured',tax_bps=null,vat_number=null");
});
beforeEach(() => { for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); });
afterAll(async () => { vi.unstubAllEnvs(); await fx?.db.close(); });

it("keeps both gates off when they are absent from the environment", async () => {
  vi.stubEnv("PAYMENTS_ENABLED", undefined as unknown as string); vi.stubEnv("PAYLINK_VERIFIED", undefined as unknown as string);
  delete process.env.PAYMENTS_ENABLED; delete process.env.PAYLINK_VERIFIED;
  expect(await paymentReadiness()).toMatchObject({ ready: false, enabled: false, verified: false });
});
it("hides the health check from callers without the operator secret", async () => {
  expect((await check()).status).toBe(404);
  expect((await check("wrong")).status).toBe(404);
  vi.stubEnv("CRON_SECRET", "");
  expect((await check("")).status).toBe(404);
});
it("VAT_REGISTERED=false sets not_registered once: 499.00 SAR with no VAT, booleans only in the health check", async () => {
  const response = await check("fictional-operator-check");
  expect(response.status).toBe(200);
  const raw = await response.text(), body = JSON.parse(raw);
  for (const value of Object.values(env).filter(v => v.length > 5)) expect(raw).not.toContain(value);
  const leaves = (o: object): unknown[] => Object.values(o).flatMap(v => v && typeof v === "object" ? leaves(v) : [v]);
  expect(leaves(body).every(v => typeof v === "boolean")).toBe(true);
  expect(body).toMatchObject({ paylink: { baseUrlIsProduction: true, liveModeSelected: true, apiIdPresent: true, apiSecretPresent: true, webhookSecretPresent: true, merchantConfigured: true },
    tax: { vatRegisteredFalse: true, vatNumberPresent: false, vatRatePresent: false, notRegistered: true, taxReady: true, environmentConflictDatabaseWins: false },
    gates: { paymentsEnabled: false, paylinkVerified: false, databaseProviderApproved: true }, readyToCharge: false });
  expect(await fx.call(coach, "ec_quote", { plan_code: "pro" })).toMatchObject({ tax_mode: "not_registered", net_halalas: 49900, vat_halalas: 0, total_halalas: 49900 });
});
it("leaves the live merchant unconfigured when PAYLINK_SANDBOX is not explicitly false", async () => {
  vi.stubEnv("PAYLINK_SANDBOX", "");
  expect(await paymentReadiness()).toMatchObject({ merchantConfigured: false, ready: false });
});
it("rejects VAT_REGISTERED=false combined with a VAT number or rate", async () => {
  vi.stubEnv("VAT_RATE", "15");
  expect(await paymentReadiness()).toMatchObject({ taxReady: false, taxEnvironmentInvalid: true, blocked: "TAX_NOT_CONFIGURED" });
});
it("lets explicit database tax settings win over the environment and reports the conflict", async () => {
  await fx.db.exec("update public.ec_config set tax_mode='exclusive',tax_bps=1500,vat_number='300000000000003'");
  expect(await paymentReadiness()).toMatchObject({ taxMode: "exclusive", taxReady: true, taxEnvironmentConflict: true });
  expect((await fx.db.query<{ tax_mode: string }>("select tax_mode from public.ec_config")).rows[0].tax_mode).toBe("exclusive");
  await fx.db.exec("update public.ec_config set tax_mode='not_registered',tax_bps=null,vat_number=null");
});
it("logs webhook 401s as one hourly row with a count and no payload", async () => {
  for (let i = 0; i < 3; i++) {
    const response = await webhook(new Request("https://easycoach.test/api/payments/paylink/webhook", { method: "POST", headers: { authorization: "Bearer wrong", "x-vercel-id": `fra1::req-${i}` }, body: "{}" }));
    expect(response.status).toBe(401);
  }
  expect(await events()).toEqual([{ source: "webhook", status: "unauthorized", invoice_id: null, amount_halalas: null, provider_amount_halalas: null, occurrences: 3, request_id: "fra1::req-2" }]);
});
it("logs verified payment states with invoice, amounts and source; replay keeps paid_until and queues Subscribe once", async () => {
  vi.stubEnv("PAYMENTS_ENABLED", "true"); vi.stubEnv("PAYLINK_VERIFIED", "true");
  const created = await createInvoice(new Request("https://easycoach.test/api/payments/paylink/create-invoice", { method: "POST", headers: { origin: "https://easycoach.test", host: "easycoach.test", "Content-Type": "application/json" }, body: JSON.stringify({ plan: "pro", total: 49900, mobile: "0501234567", terms: POLICY_VERSION }) }));
  expect(created.status).toBe(200);
  expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 499 }));
  const notify = () => webhook(new Request("https://easycoach.test/api/payments/paylink/webhook", { method: "POST", headers: { authorization: "Bearer fictional-hook-value", "x-vercel-id": "fra1::paid" }, body: JSON.stringify({ apiVersion: "v2", transactionNo: "launch-payment", merchantOrderNumber: order }) }));
  expect((await notify()).status).toBe(200);
  const first = await fx.call<{ paid_until: string; subscription_state: string }>(coach, "ec_subscription");
  expect(first.subscription_state).toBe("ACTIVE");
  expect(Date.parse(first.paid_until)).toBe(Date.parse(paidAt) + 30 * 86400000);
  expect((await notify()).status).toBe(200);
  expect((await fx.call<{ paid_until: string }>(coach, "ec_subscription")).paid_until).toBe(first.paid_until);
  const invoice = (await fx.db.query<{ id: string }>("select id from public.ec_invoices where owner_id=$1", [coach])).rows[0].id;
  expect((await events()).filter(e => e.status === "paid")).toEqual([
    { source: "webhook", status: "paid", invoice_id: invoice, amount_halalas: 49900, provider_amount_halalas: 49900, occurrences: 1, request_id: "fra1::paid" },
    { source: "webhook", status: "paid", invoice_id: invoice, amount_halalas: 49900, provider_amount_halalas: 49900, occurrences: 1, request_id: "fra1::paid" },
  ]);
  expect((await fx.db.query("select id from private.ec_pixel_events where name='Subscribe' and source_id=$1", [invoice])).rows).toHaveLength(1);
});
it("records a failed provider verification without throwing away the error", async () => {
  mock.get.mockRejectedValueOnce(Error("network"));
  const response = await webhook(new Request("https://easycoach.test/api/payments/paylink/webhook", { method: "POST", headers: { authorization: "Bearer fictional-hook-value" }, body: JSON.stringify({ transactionNo: "launch-payment", merchantOrderNumber: order }) }));
  expect(response.status).toBe(503);
  expect((await events()).at(-1)).toMatchObject({ source: "webhook", status: "verification_failed", amount_halalas: 49900 });
});
