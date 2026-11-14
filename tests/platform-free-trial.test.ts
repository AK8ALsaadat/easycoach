import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { coach, other, fixtureDatabase } from "./helpers/db";
import { blankContent } from "@/lib/model";

// The owner's own card-less 14-day trial: no consent, provider or invoice.
let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async () => { fx = await fixtureDatabase({ platformManaged: true }); });
afterAll(async () => { await fx?.db.close(); });
const query = async <T,>(sql: string, args: unknown[] = []) => (await fx.db.query<{ r: T }>(sql, args)).rows[0].r;
const state = (user = coach) => fx.call<{ status: string; effective_plan: string; billing_plan: string; total_halalas: number | null; trial_end: string; has_payment_method: boolean }>(user, "ec_subscription");
const campaign = (open: boolean) => fx.db.exec(open
  ? "update public.ec_config set trial_enabled=true,trial_start=now()-interval '1 hour',trial_end=now()+interval '30 days'"
  : "update public.ec_config set trial_enabled=false,trial_start=null,trial_end=null");

it("ships with the campaign window enabled and exposes it in the quote", async () => {
  const quote = await fx.call<{ trial_available: boolean; trial_campaign_active: boolean; trial_campaign_end: string | null; trial_days: number; trial_used: boolean }>(coach, "ec_quote", { plan_code: "pro" });
  expect(quote).toMatchObject({ trial_available: true, trial_campaign_active: true, trial_days: 14, trial_used: false });
  expect(quote.trial_campaign_end).toBeTruthy();
  expect(Date.parse(quote.trial_campaign_end!)).toBeGreaterThan(Date.parse("2099-01-01T00:00:00Z"));
  expect(await fx.call(coach, "ec_quote", { plan_code: "free" })).toMatchObject({ trial_available: false });
});
it("refuses outside the campaign window, for the free plan and for anonymous callers", async () => {
  await campaign(false);
  await expect(fx.call(coach, "ec_start_trial", { plan_code: "starter" })).rejects.toThrow(/انتهت فترة/);
  expect(await fx.call(coach, "ec_quote", { plan_code: "starter" })).toMatchObject({ trial_available: false, trial_campaign_active: false, trial_campaign_end: null });
  await campaign(true);
  await expect(fx.call(coach, "ec_start_trial", { plan_code: "free" })).rejects.toThrow(/باقة مدفوعة/);
  await expect(fx.call(coach, "ec_start_trial", { plan_code: "gold" })).rejects.toThrow(/باقة مدفوعة/);
  await expect(fx.call(null, "ec_start_trial", { plan_code: "pro" })).rejects.toThrow();
  expect(await state()).toMatchObject({ status: "free", effective_plan: "free" });
});
it("starts a trial without tax settings or a card, unlocking paid features for 336 hours", async () => {
  const result = await fx.call<{ status: string }>(coach, "ec_start_trial", { plan_code: "starter" });
  expect(result).toMatchObject({ status: "trialing", billing_plan: "starter", effective_plan: "business", total_halalas: null, has_payment_method: false });
  expect(await query("select extract(epoch from trial_end-trial_start)::int as r from public.ec_accounts where owner_id=$1", [coach])).toBe(14 * 24 * 60 * 60);
  expect(await query("select locked_price_halalas as r from public.ec_accounts where owner_id=$1", [coach])).toBe(29900);
  // A paid-only feature now works for the owner.
  await expect(fx.app(coach, "template_save", { name: "قالب التجربة", content: structuredClone(blankContent) })).resolves.toHaveProperty("id");
  expect(await fx.call(coach, "ec_quote", { plan_code: "pro" })).toMatchObject({ trial_available: false, trial_used: true });
});
it("closing the offer blocks new trials while preserving all 14 days of an existing trial", async () => {
  const before = await state();
  await campaign(false);
  expect(await state()).toMatchObject({ status: "trialing", trial_end: before.trial_end, effective_plan: "business" });
  expect(await fx.call(other, "ec_quote", { plan_code: "business" })).toMatchObject({ trial_available: false });
  await expect(fx.call(other, "ec_start_trial", { plan_code: "business" })).rejects.toThrow(/انتهت فترة/);
  await campaign(true);
});
it("never grants a second trial, even after the first one ends", async () => {
  await expect(fx.call(coach, "ec_start_trial", { plan_code: "pro" })).rejects.toThrow(/اشتراك قائم|من قبل/);
  await fx.db.query("update public.ec_accounts set trial_start=now()-interval '15 days',trial_end=now()-interval '1 day' where owner_id=$1", [coach]);
  // Computed at read time, before any scheduler run.
  expect(await state()).toMatchObject({ status: "expired", effective_plan: "free" });
  await query("select public.ec_reconcile() as r");
  expect(await query("select status as r from public.ec_accounts where owner_id=$1", [coach])).toBe("expired");
  await expect(fx.call(coach, "ec_start_trial", { plan_code: "pro" })).rejects.toThrow(/من قبل/);
  await expect(fx.app(coach, "template_save", { name: "قالب بعد الانتهاء", content: structuredClone(blankContent) })).rejects.toThrow();
});
it("refuses legacy accounts and leaves provider-bound trials on the past_due path", async () => {
  await fx.db.query("update public.ec_accounts set mode='legacy' where owner_id=$1", [other]);
  await expect(fx.call(other, "ec_start_trial", { plan_code: "pro" })).rejects.toThrow(/سابق/);
  await fx.db.query("update public.ec_accounts set mode='managed' where owner_id=$1", [other]);
  await fx.db.exec("update public.ec_config set tax_mode='not_registered'");
  expect(await fx.call(other, "ec_start_trial", { plan_code: "pro" })).toMatchObject({ status: "trialing", total_halalas: 49900 });
  await fx.db.query("update public.ec_accounts set recurring_ref='RP-fixture',payment_method_ref='m',trial_start=now()-interval '15 days',trial_end=now()-interval '1 day' where owner_id=$1", [other]);
  expect(await state(other)).toMatchObject({ status: "past_due" });
});
it("rolls back only when no card-less trial is running", async () => {
  await expect(fx.db.query("update public.ec_accounts set locked_total_halalas=-1 where owner_id=$1", [coach])).rejects.toThrow(/check constraint/);
  const down = await readFile("supabase/rollbacks/20261116100000_platform_free_trial.down.sql", "utf8");
  await fx.db.query("update public.ec_accounts set trial_start=now()-interval '13 days',trial_end=now()+interval '1 day',recurring_ref=null where owner_id=$1", [other]);
  await expect(fx.db.exec(down)).rejects.toThrow(/still running/);
  await fx.db.query("update public.ec_accounts set trial_start=now()-interval '14 days 1 second',trial_end=now()-interval '1 second' where owner_id=$1", [other]);
  await fx.db.exec(down);
  expect((await fx.db.query("select 1 from pg_proc where proname='ec_start_trial'")).rows).toHaveLength(0);
  expect(await state()).toMatchObject({ status: "expired" });
  await expect(fx.db.query("update public.ec_accounts set locked_total_halalas=-1 where owner_id=$1", [coach])).rejects.toThrow(/check constraint/);
});
