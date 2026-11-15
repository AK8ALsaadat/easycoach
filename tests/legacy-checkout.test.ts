import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { coach, other, fixtureDatabase } from "./helpers/db";
import { POLICY_VERSION } from "@/lib/legal";
import { canPayPlatform, planCodes, type PlatformQuote, type PlatformState } from "@/lib/platform/plans";
import { PlanCards } from "@/components/plan-cards";
import { PlatformCheckout } from "@/components/platform-checkout";

const mock = vi.hoisted(() => ({ call: vi.fn(), actor: vi.fn(), rpc: vi.fn(), auth: vi.fn(), create: vi.fn(), get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/platform/billing-store", () => ({ billingCall: mock.call }));
vi.mock("@/lib/server", () => ({ actor: mock.actor, rpc: mock.rpc }));
vi.mock("@/lib/paylink/client", async original => ({ ...await original<typeof import("@/lib/paylink/client")>(), createPaylinkClient: () => ({ auth: mock.auth, createInvoice: mock.create, getInvoice: mock.get }) }));
import { POST as checkout } from "@/app/api/payments/paylink/create-invoice/route";

let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
const sql = async <T = Record<string, unknown>>(query: string, args: unknown[] = []) => (await fx.db.query<{ r: T }>(query, args)).rows[0]?.r;
const state = (id = coach) => fx.call<PlatformState>(id, "ec_subscription");
const request = (consent = false) => new Request("https://easycoach.test/api/platform/checkout", { method: "POST", headers: { origin: "https://easycoach.test", host: "easycoach.test", "Content-Type": "application/json" }, body: JSON.stringify({ plan: "pro", total: 500, mobile: "0501234567", terms: POLICY_VERSION, coupon: "anho", transitionLegacy: consent }) });
type Attempt = { id: string; order_no: string; invoice_id: string; transaction_no?: string };
const settle = (p: Attempt, amount = 500, status = "Paid") => sql<string>("select public.ec_billing_settle($1,$2,$3,$4,'SAR',$5,now(),'[]') as r", [p.id, p.transaction_no ?? `tx-${p.id}`, p.order_no, amount, status]);
beforeAll(async () => {
  fx = await fixtureDatabase();
  for (const [key, value] of Object.entries({ PAYMENTS_ENABLED: "true", PAYLINK_VERIFIED: "true", PAYLINK_SANDBOX: "false", PAYLINK_BASE_URL: "https://restapi.paylink.sa", PAYLINK_API_ID: "fictional-id", PAYLINK_API_SECRET: "fictional-secret", PAYLINK_WEBHOOK_SECRET: "fictional-hook", APP_URL: "https://easycoach.test", VAT_REGISTERED: "false", VAT_NUMBER: "", VAT_RATE: "" })) vi.stubEnv(key, value);
  await fx.db.exec("update public.ec_config set provider_verified=true,tax_mode='not_registered'");
  mock.actor.mockResolvedValue({ id: coach, email: "legacy@example.test", name: "Legacy owner" });
  mock.rpc.mockImplementation((name: string) => fx.call(coach, name));
  mock.call.mockImplementation((name: string, args: Record<string, unknown> = {}) => { const entries = Object.entries(args); return sql(`select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(",")}) as r`, entries.map(([, value]) => value !== null && typeof value === "object" ? JSON.stringify(value) : value)); });
  mock.auth.mockResolvedValue("fictional-token");
  mock.create.mockResolvedValue({ transactionNo: "legacy-payment", url: "https://paylink.sa/fictional-legacy" });
});
afterAll(async () => { vi.unstubAllEnvs(); await fx?.db.close(); });

it("renders checkout links for every paid legacy plan, including the card showing current legacy benefits", async () => {
  const current = await state(); expect(current.mode).toBe("legacy"); expect(canPayPlatform(current)).toBe(true);
  const quotes = await Promise.all(planCodes.map(code => fx.call<PlatformQuote>(coach, "ec_quote", { plan_code: code })));
  const html = renderToStaticMarkup(createElement(PlanCards, { state: current, quotes, signedIn: true, context: "pricing" }));
  for (const plan of ["starter", "pro", "business"]) expect(html).toContain(`/subscription/confirm?plan=${plan}`);
  expect(html).not.toContain("حسابك سابق ويملك كل المزايا بالفعل");
  expect(html).not.toContain("أول 14 يومًا مجانًا");
  const form = renderToStaticMarkup(createElement(PlatformCheckout, { plan: "pro", total: 49900, transitionLegacy: true }));
  expect(form).toContain('name="legacyTransition"'); expect(form).toContain("نقل حسابي السابق"); expect(form).toContain("كوبون الخصم");
  const trialCards = renderToStaticMarkup(createElement(PlanCards, { state: { ...current, mode: "managed", status: "trialing", billing_plan: "pro" }, quotes, signedIn: true, context: "pricing" }));
  expect(trialCards.match(/ادفع الآن لتبدأ بعد التجربة/g)).toHaveLength(3);
});
it("previews anho for legacy accounts without converting them or creating an invoice", async () => {
  expect(await sql("select public.ec_billing_coupon_quote($1,'pro','anho') as r", [coach])).toMatchObject({ coupon_code: "anho", total_halalas: 500 });
  expect((await state()).mode).toBe("legacy");
  expect(await sql("select count(*)::int as r from public.ec_invoices")).toBe(0);
});
it("requires explicit transition consent at both the API and service SQL boundaries", async () => {
  const response = await checkout(request()); expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "legacy_consent_required" });
  await expect(sql("select public.ec_billing_prepare($1,'pro',500,'anho') as r", [coach])).rejects.toThrow("legacy_consent_required");
  expect(mock.create).not.toHaveBeenCalled(); expect((await state()).mode).toBe("legacy");
});
it("creates a 5 SAR invoice with recorded consent while preserving legacy access until verified payment", async () => {
  expect((await checkout(request(true))).status).toBe(200);
  expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 5 }));
  expect(await state()).toMatchObject({ mode: "legacy", effective_plan: "business", period_end: null });
  expect(await sql("select quote->'legacy_transition' as r from private.ec_paylink_checkouts")).toBe(true);
  const p = await sql<Attempt>("select to_jsonb(p) as r from private.ec_payment_attempts p limit 1");
  expect(await settle(p, 500, "Pending")).toBe("pending"); expect((await state()).mode).toBe("legacy");
});
it("converts only after matching payment, preserves coaching data and never reverts to legacy on expiry", async () => {
  const client = await fx.client();
  const p = await sql<Attempt>("select to_jsonb(p) as r from private.ec_payment_attempts p limit 1");
  expect(await settle(p)).toBe("paid");
  const first = await state(); expect(first).toMatchObject({ mode: "managed", effective_plan: "pro", subscription_state: "ACTIVE" });
  expect(await sql("select id::text as r from public.clients where id=$1", [client])).toBe(client);
  expect(await settle(p)).toBe("paid"); expect((await state()).paid_until).toBe(first.paid_until);
  await fx.db.query("update public.ec_accounts set period_end=now()-interval '73 hours' where owner_id=$1", [coach]);
  expect(await state()).toMatchObject({ mode: "managed", effective_plan: "free", subscription_state: "SUSPENDED" });
});
it("does not withdraw legacy access for an underpaid invoice", async () => {
  await sql("select public.ec_billing_contact($1,'0501234567','Other legacy') as r", [other]);
  const p = await sql<Attempt>("select public.ec_billing_prepare($1,'pro',500,'anho',true) as r", [other]);
  expect(await settle(p, 499)).toBe("review"); expect(await state(other)).toMatchObject({ mode: "legacy", effective_plan: "business", period_end: null });
});
it("preserves any live trial during voluntary legacy migration and starts the purchased period after it", async () => {
  const id = crypto.randomUUID();
  await fx.db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,'fictional-unused',now())", [id, `${id}@example.test`]);
  await fx.call(id, "init_profile", { display_name: "Legacy trial fixture", requested_role: "coach" });
  await fx.db.query("update public.ec_accounts set mode='managed' where owner_id=$1", [id]);
  await sql("select public.ec_billing_start($1,'pro','0501234567','Legacy trial fixture',$2) as r", [id, POLICY_VERSION]);
  await fx.db.query("update public.ec_accounts set mode='legacy' where owner_id=$1", [id]);
  const before = await state(id);
  const p = await sql<Attempt>("select public.ec_billing_prepare($1,'starter',500,'anho',true) as r", [id]);
  expect(await settle(p)).toBe("paid");
  expect(await state(id)).toMatchObject({ mode: "managed", effective_plan: "business", billing_plan: "starter", period_start: before.trial_end, trial_end: before.trial_end });
  expect(Date.parse((await state(id)).paid_until!)).toBe(Date.parse(before.trial_end!) + 30 * 86400000);
});
