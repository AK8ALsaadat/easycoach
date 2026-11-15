import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fixtureDatabase } from "./helpers/db";
import { POLICY_VERSION } from "@/lib/legal";
import { canPayPlatform, type PlatformState } from "@/lib/platform/plans";
import { SubscriptionLifecycle } from "@/components/subscription-lifecycle";
vi.mock("@/app/platform-actions", () => ({ cancelPlatformSubscription: vi.fn() }));
vi.mock("server-only", () => ({}));

let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
type Attempt = { id: string; order_no: string; invoice_id: string; created: boolean };
const sql = async <T = Record<string, unknown>>(query: string, args: unknown[] = []) => (await fx.db.query<{ r: T }>(query, args)).rows[0]?.r;
async function owner() {
  const id = crypto.randomUUID();
  await fx.db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,'fictional-unused-password',now())", [id, `${id}@example.test`]);
  await fx.call(id, "init_profile", { display_name: "Prepayment fixture", requested_role: "coach" });
  await sql("select public.ec_billing_start($1,'pro','0501234567','Prepayment fixture',$2) as r", [id, POLICY_VERSION]);
  return id;
}
const state = (id: string) => fx.call<PlatformState>(id, "ec_subscription");
const prepare = (id: string, plan = "starter") => sql<Attempt>("select public.ec_billing_prepare($1,$2,500,'anho') as r", [id, plan]);
const settle = (p: Attempt, amount = 500, status = "Paid", paidAt = new Date().toISOString()) => sql<string>("select public.ec_billing_settle($1,$2,$3,$4,'SAR',$5,$6,'[]') as r", [p.id, `tx-${p.id}`, p.order_no, amount, status, paidAt]);
beforeAll(async () => { fx = await fixtureDatabase({ platformManaged: true }); await fx.db.exec("update public.ec_config set provider_verified=true,tax_mode='not_registered'"); });
afterAll(async () => { await fx?.db.close(); });

it("offers payment throughout a live trial and preserves trial access for an unpaid invoice", async () => {
  const id = await owner();
  expect(canPayPlatform(await state(id))).toBe(true);
  const [first, retry] = await Promise.all([prepare(id), prepare(id)]);
  expect(first.created).toBe(true); expect(retry.id).toBe(first.id); expect(retry.created).toBe(false);
  expect(await settle(first, 500, "Pending")).toBe("pending");
  expect(await state(id)).toMatchObject({ status: "trialing", subscription_state: "TRIAL_ACTIVE", effective_plan: "business", paid_until: null });
});
it("starts 30 paid days at the trial end while keeping all Business features and the regular renewal price", async () => {
  const id = await owner(), before = await state(id), p = await prepare(id);
  const paidAt = new Date().toISOString();
  expect(await settle(p, 500, "Paid", paidAt)).toBe("paid");
  const after = await state(id);
  expect(after).toMatchObject({ status: "trialing", subscription_state: "TRIAL_ACTIVE", billing_plan: "starter", effective_plan: "business", trial_end: before.trial_end, period_start: before.trial_end, locked_price_halalas: 29900 });
  expect(Date.parse(after.paid_until!)).toBe(Date.parse(before.trial_end!) + 30 * 86400000);
  expect(canPayPlatform(after)).toBe(false);
  const invoice = await sql<{ paid_at: string; start: string; end: string; amount: number }>("select jsonb_build_object('paid_at',paid_at,'start',cycle_start,'end',cycle_end,'amount',amount_halalas) as r from public.ec_invoices where id=$1", [p.invoice_id]);
  expect(invoice).toMatchObject({ start: after.period_start, end: after.paid_until, amount: 500 });
  expect(Date.parse(invoice.paid_at)).toBe(Date.parse(paidAt));
  expect(await settle(p)).toBe("paid");
  expect((await state(id)).paid_until).toBe(after.paid_until);
  await expect(prepare(id)).rejects.toThrow("period_running");
  expect(await sql("select count(*)::int as r from public.ec_invoices where owner_id=$1", [id])).toBe(1);
});
it("switches to the paid plan exactly when the trial ends without waiting for cron", async () => {
  const id = await owner(), p = await prepare(id);
  await settle(p);
  await fx.db.query("update public.ec_accounts set trial_start=now()-interval '336 hours',trial_end=now(),period_start=now(),period_end=now()+interval '30 days' where owner_id=$1", [id]);
  expect(await state(id)).toMatchObject({ status: "active", subscription_state: "ACTIVE", effective_plan: "starter" });
});
it("starts immediately after an expired trial and rejects an underpaid verified invoice", async () => {
  const id = await owner();
  await fx.db.query("update public.ec_accounts set trial_start=now()-interval '337 hours',trial_end=now()-interval '1 hour' where owner_id=$1", [id]);
  const p = await prepare(id), paidAt = new Date().toISOString();
  expect(await settle(p, 500, "Paid", paidAt)).toBe("paid");
  expect(Date.parse((await state(id)).period_start!)).toBe(Date.parse(paidAt));
  expect(Date.parse((await state(id)).paid_until!)).toBe(Date.parse(paidAt) + 30 * 86400000);
  const unpaid = await owner(), wrong = await prepare(unpaid);
  expect(await settle(wrong, 499)).toBe("review");
  expect(await state(unpaid)).toMatchObject({ effective_plan: "business", period_end: null });
});
it("retains both the promised trial and purchased period after cancellation, with no further checkout", async () => {
  const id = await owner(), p = await prepare(id); await settle(p);
  await fx.call(id, "ec_billing_cancel");
  expect(await state(id)).toMatchObject({ subscription_state: "CANCELLED", effective_plan: "business" });
  expect(canPayPlatform(await state(id))).toBe(false);
  await expect(prepare(id)).rejects.toThrow("subscription_cancelled");
  await fx.db.query("update public.ec_accounts set trial_end=now(),trial_start=now()-interval '336 hours',period_start=now() where owner_id=$1", [id]);
  expect(await state(id)).toMatchObject({ subscription_state: "CANCELLED", effective_plan: "starter" });
});
it("shows an early-payment link before payment and scheduled dates without a second checkout after payment", async () => {
  const id = await owner();
  const readiness = { ready: true, enabled: true, verified: true, taxReady: true, blocked: null } as const;
  const overview = { notifications: [], invoices: [] };
  const render = async () => renderToStaticMarkup(createElement(SubscriptionLifecycle, { state: await state(id), readiness, overview }));
  expect(await render()).toContain("ادفع الآن لتبدأ باقتك بعد التجربة");
  await settle(await prepare(id));
  const html = await render();
  expect(html).toContain("تم سداد الاشتراك القادم"); expect(html).toContain("تبدأ الفترة المدفوعة في");
  expect(html).not.toContain("ادفع الآن لتبدأ باقتك بعد التجربة");
});
