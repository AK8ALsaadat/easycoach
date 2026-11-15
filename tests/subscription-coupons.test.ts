import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { coach, other, fixtureDatabase } from "./helpers/db";
import { POLICY_VERSION } from "@/lib/legal";

const mock = vi.hoisted(() => ({ call: vi.fn(), actor: vi.fn(), rpc: vi.fn(), auth: vi.fn(), create: vi.fn(), get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/platform/billing-store", () => ({ billingCall: mock.call }));
vi.mock("@/lib/server", () => ({ actor: mock.actor, rpc: mock.rpc }));
vi.mock("@/lib/paylink/client", async original => ({ ...await original<typeof import("@/lib/paylink/client")>(), createPaylinkClient: () => ({ auth: mock.auth, createInvoice: mock.create, getInvoice: mock.get }) }));
import { POST as coupon } from "@/app/api/platform/coupon/route";
import { POST as checkout } from "@/app/api/payments/paylink/create-invoice/route";
import { POST as webhook } from "@/app/api/payments/paylink/webhook/route";

let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
let order = "";
const user = { id: coach, email: "owner@example.test", name: "Coupon fixture" };
const paidAt = new Date().toISOString();
const request = (body: object, path = "coupon") => new Request(`https://easycoach.test/api/platform/${path}`, { method: "POST", headers: { origin: "https://easycoach.test", host: "easycoach.test", "Content-Type": "application/json" }, body: JSON.stringify(body) });
const invoiceRequest = (total = 500, code: string | undefined = "anho") => request({ plan: "pro", total, mobile: "0501234567", terms: POLICY_VERSION, ...(code ? { coupon: code } : {}) }, "checkout");
const sql = async <T = Record<string, unknown>>(query: string, args: unknown[] = []) => (await fx.db.query<{ r: T }>(query, args)).rows[0]?.r;
const quote = (code = "anho", plan = "pro") => sql<Record<string, unknown>>("select public.ec_billing_coupon_quote($1,$2,$3) as r", [coach, plan, code]);

beforeAll(async () => {
  fx = await fixtureDatabase({ platformManaged: true });
  for (const [key, value] of Object.entries({ PAYMENTS_ENABLED: "true", PAYLINK_VERIFIED: "true", PAYLINK_SANDBOX: "false", PAYLINK_BASE_URL: "https://restapi.paylink.sa", PAYLINK_API_ID: "fictional-id", PAYLINK_API_SECRET: "fictional-secret", PAYLINK_WEBHOOK_SECRET: "fictional-hook", APP_URL: "https://easycoach.test", VAT_REGISTERED: "false", VAT_NUMBER: "", VAT_RATE: "" })) vi.stubEnv(key, value);
  await fx.db.exec("update public.ec_config set provider_verified=true,tax_mode='not_registered'");
  mock.actor.mockResolvedValue(user);
  mock.rpc.mockImplementation((name: string) => fx.call(coach, name));
  mock.call.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    const entries = Object.entries(args);
    return sql(`select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(",")}) as r`, entries.map(([, value]) => value !== null && typeof value === "object" ? JSON.stringify(value) : value));
  });
  mock.auth.mockResolvedValue("fictional-token");
  mock.create.mockImplementation(async (input: { orderNumber: string }) => { order = input.orderNumber; return { transactionNo: "coupon-payment", url: "https://paylink.sa/fictional-coupon" }; });
  mock.get.mockImplementation(async () => ({ transactionNo: "coupon-payment", orderNumber: order, currency: "SAR", orderStatus: "Pending", rawStatus: "Pending", amount: 5, paidAt, paymentErrors: [] }));
});
afterAll(async () => { vi.unstubAllEnvs(); await fx?.db.close(); });

it("seeds an enabled 99% coupon, normalizes case/space and enforces the disclosed 5 SAR floor", async () => {
  expect(await quote(" ANHO ")).toMatchObject({ coupon_code: "anho", coupon_percent: 99, regular_total_halalas: 49900, total_halalas: 500, coupon_discount_halalas: 49400, minimum_applied: true });
  expect(await quote("anho", "starter")).toMatchObject({ total_halalas: 500, minimum_applied: true });
  expect(await quote("anho", "business")).toMatchObject({ total_halalas: 699, minimum_applied: false });
  expect(await sql("select count(*)::int as r from public.ec_invoices")).toBe(0);
});
it("does not stack campaign discounts, and computes exclusive/inclusive VAT after the coupon", async () => {
  await fx.db.exec("update public.ec_config set discount_enabled=true,reference_prices_approved=true,discount_start=now()-interval '1 day',discount_end=now()+interval '1 day'");
  expect(await quote("anho", "business")).toMatchObject({ regular_total_halalas: 55920, total_halalas: 699 });
  await fx.db.exec("update public.ec_config set discount_enabled=false,tax_mode='exclusive',tax_bps=1500,vat_number='300000000000003'");
  expect(await quote()).toMatchObject({ net_halalas: 499, vat_halalas: 75, total_halalas: 574, minimum_applied: false });
  expect(await quote("anho", "starter")).toMatchObject({ net_halalas: 435, vat_halalas: 65, total_halalas: 500, minimum_applied: true });
  await fx.db.exec("update public.ec_config set tax_mode='inclusive'");
  expect(await quote()).toMatchObject({ net_halalas: 500, vat_halalas: 65, total_halalas: 500, minimum_applied: true });
  await fx.db.exec("update public.ec_config set tax_mode='not_registered',tax_bps=null,vat_number=null");
});
it("keeps coupon data and service mutations unavailable to browser roles", async () => {
  expect(await sql("select has_table_privilege('authenticated','private.ec_coupons','SELECT') as r")).toBe(false);
  await expect(fx.call(coach, "ec_billing_coupon_quote", { owner: coach, plan_code: "pro", coupon_code: "anho" })).rejects.toThrow(/permission denied/);
  await expect(fx.call(coach, "ec_billing_prepare", { owner: coach, plan_code: "pro", expected_total: 500, coupon_code: "anho" })).rejects.toThrow(/permission denied/);
});
it("requires authentication and same-origin requests for coupon preview", async () => {
  mock.actor.mockResolvedValueOnce(null);
  expect((await coupon(request({ plan: "pro", coupon: "anho" }))).status).toBe(401);
  const crossOrigin = request({ plan: "pro", coupon: "anho" }); crossOrigin.headers.set("origin", "https://evil.test");
  expect((await coupon(crossOrigin)).status).toBe(403);
  const response = await coupon(request({ plan: "pro", coupon: "ANHO" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ quote: { coupon_code: "anho", total_halalas: 500 } });
});
it("rejects invalid, disabled, future and expired coupons, including direct checkout after preview", async () => {
  expect((await coupon(request({ plan: "pro", coupon: "unknown" }))).status).toBe(400);
  expect((await coupon(request({ plan: "free", coupon: "anho" }))).status).toBe(400);
  await fx.db.exec("update private.ec_coupons set enabled=false where code='anho'");
  expect((await checkout(invoiceRequest())).status).toBe(409);
  expect(mock.create).not.toHaveBeenCalled();
  await fx.db.exec("update private.ec_coupons set enabled=true,starts_at=now()+interval '1 day' where code='anho'");
  await expect(quote()).rejects.toThrow(/coupon_invalid/);
  await fx.db.exec("update private.ec_coupons set starts_at=now()-interval '2 days',expires_at=now()-interval '1 day' where code='anho'");
  await expect(quote()).rejects.toThrow(/coupon_invalid/);
  await fx.db.exec("update private.ec_coupons set expires_at=null where code='anho'");
});
it("recalculates the payable total and prevents client-supplied discount amounts", async () => {
  expect((await checkout(invoiceRequest(1))).status).toBe(409);
  expect((await checkout(invoiceRequest(499))).status).toBe(409);
  expect((await checkout(invoiceRequest(500, ""))).status).toBe(409);
  expect((await checkout(invoiceRequest())).status).toBe(200);
  expect(mock.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ amount: 5, products: [expect.objectContaining({ price: 5 })] }));
  expect(await fx.call(coach, "ec_subscription")).toMatchObject({ effective_plan: "free", paid_until: null });
  expect((await checkout(invoiceRequest())).status).toBe(200);
  expect(mock.create).toHaveBeenCalledTimes(1);
  expect(await sql("select quote->>'coupon_code' as r from private.ec_paylink_checkouts")).toBe("anho");
});
it("does not silently reprice an existing invoice or substitute another coupon", async () => {
  expect((await checkout(invoiceRequest(49900, ""))).status).toBe(409);
  await fx.db.query("select public.ec_billing_contact($1,'0501234567','Other fixture')", [other]);
  await fx.db.query("select public.ec_billing_prepare($1,'pro',49900)", [other]);
  await expect(fx.db.query("select public.ec_billing_prepare($1,'pro',500,'anho')", [other])).rejects.toThrow(/pending_invoice/);
});
it("activates only after a verified matching 5 SAR payment, replays once and restores the regular renewal price", async () => {
  const notify = () => webhook(new Request("https://easycoach.test/api/payments/paylink/webhook", { method: "POST", headers: { authorization: "Bearer fictional-hook" }, body: JSON.stringify({ transactionNo: "coupon-payment", merchantOrderNumber: order }) }));
  const paid = { transactionNo: "coupon-payment", orderNumber: order, currency: "SAR", orderStatus: "Paid", rawStatus: "Paid", amount: 5, paidAt, paymentErrors: [] };
  mock.get.mockResolvedValue(paid);
  expect((await notify()).status).toBe(200);
  const first = await fx.call(coach, "ec_subscription");
  expect(first).toMatchObject({ subscription_state: "ACTIVE", effective_plan: "pro", locked_price_halalas: 49900 });
  expect(await sql("select amount_halalas as r from public.ec_invoices where owner_id=$1", [coach])).toBe(500);
  expect((await notify()).status).toBe(200);
  expect((await fx.call(coach, "ec_subscription")).paid_until).toBe(first.paid_until);
  expect(await fx.call(coach, "ec_quote", { plan_code: "pro" })).toMatchObject({ net_halalas: 49900, total_halalas: 49900 });
  expect(await sql("select count(*)::int as r from private.ec_pixel_events where name='Subscribe'")).toBe(1);
});
