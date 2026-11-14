import { afterAll, beforeAll, expect, it } from "vitest";
import { coach, other, trainee, fixtureDatabase } from "./helpers/db";
import { POLICY_VERSION } from "@/lib/legal";

let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async () => { fx = await fixtureDatabase({ platformManaged: true }); });
afterAll(async () => { await fx?.db.close(); });
type Invoice = { id: string; provider_order: string; created: boolean; amount_halalas: number };
const reserve = (owner = coach, plan = "pro", total = 49900) => fx.call<Invoice>(owner, "ec_paylink_reserve", { plan_code: plan, expected_total: total, accepted_version: POLICY_VERSION });
const settle = async (i: Invoice, tx = "tx-platform", amount = i.amount_halalas, currency = "SAR", status = "Paid") => (await fx.db.query<{ r: string }>("select public.ec_paylink_settle($1,$2,$3,$4,$5,$6) as r", [i.id, tx, i.provider_order, amount, currency, status])).rows[0].r;

it("requires a platform owner, current consent, verified provider, and configured tax", async () => {
  await expect(reserve(trainee)).rejects.toThrow("owner_required");
  await expect(reserve()).rejects.toThrow("billing_unavailable");
  await fx.db.exec("update public.ec_config set provider_verified=true");
  await expect(reserve()).rejects.toThrow("tax_unconfigured");
  await fx.db.exec("update public.ec_config set tax_mode='not_registered'");
  await expect(fx.call(coach, "ec_paylink_reserve", { plan_code: "pro", expected_total: 49900, accepted_version: "old" })).rejects.toThrow("terms_required");
  await expect(reserve(coach, "pro", 1)).rejects.toThrow("quote_changed");
  await expect(reserve(coach, "free", 49900)).rejects.toThrow("invalid_plan");
  expect((await fx.db.query("select id from public.ec_invoices")).rows).toHaveLength(0);
});
it("reserves once and retains an uncertain remote creation rather than charging twice", async () => {
  const first = await reserve();
  const second = await reserve();
  expect(first.created).toBe(true); expect(second.created).toBe(false); expect(first.id).toBe(second.id);
  await expect(reserve(coach, "starter", 29900)).rejects.toThrow("pending_invoice");
  expect((await fx.db.query("select id from public.ec_invoices")).rows).toHaveLength(1);
  expect((await fx.db.query("select policy_version,quote->>'total_halalas' as total from private.ec_paylink_checkouts")).rows[0]).toEqual({ policy_version: POLICY_VERSION, total: "49900" });
});
it("activates one paid month only from the trusted exact amount/currency/reference and changes no trainee ledger", async () => {
  const invoice = await reserve();
  expect(await settle(invoice, "tx-platform", 49900, "SAR", "Pending")).toBe("pending");
  await expect(fx.call(coach, "ec_paylink_settle", { invoice: invoice.id, transaction: "forged", order_no: invoice.provider_order, amount: 49900, currency_code: "SAR", provider_status: "Paid" })).rejects.toThrow(/permission denied/);
  expect(await settle(invoice)).toBe("paid");
  expect(await settle(invoice)).toBe("paid");
  const account = await fx.call(coach, "ec_subscription");
  expect(account).toMatchObject({ effective_plan: "pro", status: "active", cancel_at_period_end: true, has_payment_method: false, total_halalas: 49900 });
  expect((await fx.db.query<{correct:boolean}>("select period_end=period_start+interval '1 month' as correct from public.ec_accounts where owner_id=$1", [coach])).rows[0].correct).toBe(true);
  expect((await fx.db.query("select id from public.payments")).rows).toHaveLength(0);
  expect((await fx.db.query("select id from public.paylink_invoices")).rows).toHaveLength(0);
  await expect(reserve()).rejects.toThrow("period_running");
});
it("preserves the full free trial, rejects legacy accounts and sends mismatched payments to review", async () => {
  await fx.call(other, "ec_start_trial_accepted", { plan_code: "starter", accepted_version: POLICY_VERSION });
  await expect(reserve(other)).rejects.toThrow("period_running");
  await fx.db.exec("update public.ec_accounts set trial_start=now()-interval '337 hours',trial_end=now()-interval '1 hour' where owner_id='"+other+"'");
  const invoice = await reserve(other);
  expect(await settle(invoice, "tx-mismatch", 1)).toBe("review");
  expect(await settle(invoice, "tx-mismatch")).toBe("review");
  await expect(reserve(other)).rejects.toThrow("payment_review");
  expect(await fx.call(other, "ec_subscription")).toMatchObject({ effective_plan: "free" });
  await fx.db.query("update public.ec_accounts set mode='legacy' where owner_id=$1", [other]);
  await expect(reserve(other)).rejects.toThrow("owner_required");
});
it("retires the coach merchant/trainee collection RPCs even for service_role", async () => {
  const grants = await fx.db.query<{ allowed: boolean }>("select has_function_privilege(r.oid,p.oid,'EXECUTE') as allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where r.rolname in ('service_role','authenticated','anon') and n.nspname='public' and p.proname like 'paylink_%'");
  expect(grants.rows.length).toBeGreaterThan(0);
  expect(grants.rows.every(r => !r.allowed)).toBe(true);
});
it("sends a provider cancellation after payment to review instead of claiming payment success", async () => {
  const invoice = (await fx.db.query<Invoice>("select * from public.ec_invoices where owner_id=$1 and status='paid'", [coach])).rows[0];
  expect(await settle(invoice, "tx-platform", 49900, "SAR", "Canceled")).toBe("review");
  expect((await fx.db.query<{ review_reason: string }>("select review_reason from public.ec_invoices where id=$1", [invoice.id])).rows[0].review_reason).toBe("provider_canceled_after_payment");
  expect(await settle(invoice)).toBe("review");
});
