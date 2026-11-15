import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ call: vi.fn(), get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/platform/billing-store", () => ({ billingCall: mock.call }));
vi.mock("@/lib/paylink/client", async original => ({ ...await original<typeof import("@/lib/paylink/client")>(), createPaylinkClient: () => ({ auth: vi.fn(), getInvoice: mock.get }) }));
import { POST } from "@/app/api/payments/paylink/webhook/route";

const SECRET = "fictional-hook-value";
const attempt = { id: "11111111-1111-4111-8111-111111111111", invoice_id: "22222222-2222-4222-8222-222222222222", owner_id: "33333333-3333-4333-8333-333333333333", order_no: "ECP-" + "a".repeat(32), transaction_no: "tx-1", payment_url: null, amount_halalas: 49900, plan: "pro", mobile: "0501234567", customer_name: "Owner" };
let lookup: unknown = null, settle: unknown = "paid";

beforeEach(() => {
  for (const [key, value] of Object.entries({ PAYLINK_WEBHOOK_SECRET: SECRET, PAYLINK_SANDBOX: "false", PAYLINK_BASE_URL: "https://restapi.paylink.sa", PAYLINK_API_ID: "fictional-id", PAYLINK_API_SECRET: "fictional-secret" })) vi.stubEnv(key, value);
  lookup = null; settle = "paid";
  vi.spyOn(console, "error").mockImplementation(() => {});
  mock.call.mockReset().mockImplementation(async (name: string) => {
    // Simulates production before the migration: the payment log table does not exist.
    if (name === "ec_billing_event_log") throw Error('relation "private.payment_events" does not exist');
    if (name === "ec_billing_lookup") return lookup;
    if (name === "ec_billing_settle") return settle;
    return null;
  });
  mock.get.mockReset().mockResolvedValue({ transactionNo: "tx-1", orderNumber: attempt.order_no, currency: "SAR", orderStatus: "Paid", rawStatus: "Paid", amount: 499, paidAt: new Date().toISOString(), paymentErrors: [] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const send = (body: string, auth: string | null = SECRET) => POST(new Request("https://easycoach.test/api/payments/paylink/webhook", { method: "POST", headers: auth === null ? {} : { authorization: `Bearer ${auth}` }, body }));
const valid = JSON.stringify({ apiVersion: "v2", transactionNo: "tx-1", merchantOrderNumber: attempt.order_no });
async function expectJson(response: Response, status: number, body: object) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  const text = await response.text();
  expect(() => JSON.parse(text)).not.toThrow();
  expect(JSON.parse(text)).toEqual(body);
  for (const leak of [SECRET, "fictional-secret", "private.payment_events", "relation", "stack"]) expect(text).not.toContain(leak);
}

it("returns JSON success for a verified paid invoice even when the payment log table is missing", async () => {
  lookup = attempt;
  await expectJson(await send(valid), 200, { success: true });
  expect(mock.call).toHaveBeenCalledWith("ec_billing_event_log", expect.objectContaining({ event_status: "paid" }));
});
it("returns JSON success for unknown, pending, failed, canceled and review states", async () => {
  await expectJson(await send(valid), 200, { success: true });
  lookup = attempt;
  for (const state of ["pending", "failed", "canceled", "review"]) { settle = state; await expectJson(await send(valid), 200, { success: true }); }
});
it("returns JSON 401 for a missing or wrong secret, and the failed log does not change it", async () => {
  await expectJson(await send(valid, null), 401, { success: false, error: "unauthorized" });
  await expectJson(await send(valid, "wrong"), 401, { success: false, error: "unauthorized" });
});
it("returns JSON errors without internal detail for every other failure", async () => {
  await expectJson(await send("not json"), 400, { success: false, error: "invalid_json" });
  await expectJson(await send(JSON.stringify({ transactionNo: "bad value!" })), 400, { success: false, error: "invalid_payload" });
  await expectJson(await send("x".repeat(20001)), 413, { success: false, error: "payload_too_large" });
  lookup = attempt; mock.get.mockRejectedValueOnce(Error("upstream exploded with internal detail"));
  await expectJson(await send(valid), 503, { success: false, error: "verification_unavailable" });
  mock.call.mockImplementation(async () => { throw Error("database down: internal detail"); });
  await expectJson(await send(valid), 503, { success: false, error: "verification_unavailable" });
  vi.stubEnv("PAYLINK_WEBHOOK_SECRET", "");
  await expectJson(await send(valid), 503, { success: false, error: "not_configured" });
});
