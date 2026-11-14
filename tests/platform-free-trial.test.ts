import { POLICY_VERSION } from "@/lib/legal";
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
  await expect(fx.call(coach, "ec_start_trial_accepted", { plan_code: "starter", accepted_version: POLICY_VERSION })).rejects.toThrow(/انتهت فترة/);
  expect(await fx.call(coach, "ec_quote", { plan_code: "starter" })).toMatchObject({ trial_available: false, trial_campaign_active: false, trial_campaign_end: null });
  await campaign(true);
  await expect(fx.call(coach, "ec_start_trial_accepted", { plan_code: "free", accepted_version: POLICY_VERSION })).rejects.toThrow(/باقة مدفوعة/);
  await expect(fx.call(coach, "ec_start_trial_accepted", { plan_code: "gold", accepted_version: POLICY_VERSION })).rejects.toThrow(/باقة مدفوعة/);
  await expect(fx.call(null, "ec_start_trial_accepted", { plan_code: "pro", accepted_version: POLICY_VERSION })).rejects.toThrow();
  expect(await state()).toMatchObject({ status: "free", effective_plan: "free" });
});
it("starts a trial without tax settings or a card, unlocking paid features for 336 hours", async () => {
  await expect(fx.call(coach, "ec_start_trial", { plan_code: "starter" })).rejects.toThrow(/permission denied/);
  for (const version of [null, "old"]) await expect(fx.call(coach, "ec_start_trial_accepted", { plan_code: "starter", accepted_version: version })).rejects.toThrow(/الشروط/);
  const result = await fx.call<{ status: string }>(coach, "ec_start_trial_accepted", { plan_code: "starter", accepted_version: POLICY_VERSION });
  expect(result).toMatchObject({ status: "trialing", billing_plan: "starter", effective_plan: "business", total_halalas: null, has_payment_method: false });
  expect((await fx.db.query("select plan,policy_version,quote->>'trial_days' as days from public.ec_trial_consents where owner_id=$1", [coach])).rows[0]).toMatchObject({ plan: "starter", policy_version: POLICY_VERSION, days: "14" });
  expect(await query("select extract(epoch from trial_end-trial_start)::int as r from public.ec_accounts where owner_id=$1", [coach])).toBe(14 * 24 * 60 * 60);
  expect(await query("select locked_price_halalas as r from public.ec_accounts where owner_id=$1", [coach])).toBe(29900);
  // A paid-only feature now works for the owner.
  await expect(fx.app(coach, "template_save", { name: "قالب التجربة", content: structuredClone(blankContent) })).resolves.toHaveProperty("id");
  expect(await fx.call(coach, "ec_quote", { plan_code: "pro" })).toMatchObject({ trial_available: false, trial_used: true });
});
it("keeps consent private and immutable to app users, and rolls back a trial if consent cannot be recorded", async () => {
  const read = (user: string) => fx.db.transaction(async tx => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    return (await tx.query("select owner_id from public.ec_trial_consents")).rows;
  });
  expect(await read(coach)).toHaveLength(1);
  expect(await read(other)).toHaveLength(0);
  await expect(fx.db.transaction(async tx => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [coach]);
    await tx.exec("update public.ec_trial_consents set policy_version='forged'");
  })).rejects.toThrow(/permission denied/);
  await fx.db.exec("alter table public.ec_trial_consents add constraint consent_failure_fixture check(false) not valid");
  try {
    await expect(fx.call(other, "ec_start_trial_accepted", { plan_code: "pro", accepted_version: POLICY_VERSION })).rejects.toThrow(/check constraint/);
    expect(await state(other)).toMatchObject({ status: "free", trial_used_at: null });
  } finally { await fx.db.exec("alter table public.ec_trial_consents drop constraint consent_failure_fixture"); }
});
it("closing the offer blocks new trials while preserving all 14 days of an existing trial", async () => {
  const before = await state();
  await campaign(false);
  expect(await state()).toMatchObject({ status: "trialing", trial_end: before.trial_end, effective_plan: "business" });
  expect(await fx.call(other, "ec_quote", { plan_code: "business" })).toMatchObject({ trial_available: false });
  await expect(fx.call(other, "ec_start_trial_accepted", { plan_code: "business", accepted_version: POLICY_VERSION })).rejects.toThrow(/انتهت فترة/);
  await campaign(true);
});
it("never grants a second trial, even after the first one ends", async () => {
  await expect(fx.call(coach, "ec_start_trial_accepted", { plan_code: "pro", accepted_version: POLICY_VERSION })).rejects.toThrow(/اشتراك قائم|من قبل/);
  await fx.db.query("update public.ec_accounts set trial_start=now()-interval '15 days',trial_end=now()-interval '1 day' where owner_id=$1", [coach]);
  // Computed at read time, before any scheduler run.
  expect(await state()).toMatchObject({ status: "expired", effective_plan: "free" });
  await query("select public.ec_reconcile() as r");
  expect(await query("select status as r from public.ec_accounts where owner_id=$1", [coach])).toBe("expired");
  await expect(fx.call(coach, "ec_start_trial_accepted", { plan_code: "pro", accepted_version: POLICY_VERSION })).rejects.toThrow(/من قبل/);
  await expect(fx.app(coach, "template_save", { name: "قالب بعد الانتهاء", content: structuredClone(blankContent) })).rejects.toThrow();
});
it("refuses legacy accounts and leaves provider-bound trials on the past_due path", async () => {
  await fx.db.query("update public.ec_accounts set mode='legacy' where owner_id=$1", [other]);
  await expect(fx.call(other, "ec_start_trial_accepted", { plan_code: "pro", accepted_version: POLICY_VERSION })).rejects.toThrow(/سابق/);
  await fx.db.query("update public.ec_accounts set mode='managed' where owner_id=$1", [other]);
  await fx.db.exec("update public.ec_config set tax_mode='not_registered'");
  expect(await fx.call(other, "ec_start_trial_accepted", { plan_code: "pro", accepted_version: POLICY_VERSION })).toMatchObject({ status: "trialing", total_halalas: 49900 });
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
