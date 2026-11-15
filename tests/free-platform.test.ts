import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { coach, other, trainee, fixtureDatabase } from "./helpers/db";
import { blankContent } from "@/lib/model";
import { billingEnabled } from "@/lib/billing-mode";
let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async () => { fx = await fixtureDatabase({ platformManaged: true, billingEnabled: false }); });
afterAll(async () => { await fx?.db.close(); vi.unstubAllEnvs(); });

it("defaults to free access and enables billing only for explicit true", () => {
  for (const value of [undefined, "false", "", "TRUE"]) {
    vi.stubEnv("BILLING_ENABLED", value); expect(billingEnabled()).toBe(false);
  }
  vi.stubEnv("BILLING_ENABLED", "true"); expect(billingEnabled()).toBe(true);
  vi.unstubAllEnvs();
});
it("opens every feature and removes client, template and team quotas without changing account history", async () => {
  const original = (await fx.db.query("select to_jsonb(a) as a from public.ec_accounts a where owner_id=$1", [coach])).rows[0];
  const clients: string[] = [];
  for (let i=0; i<55; i++) clients.push(await fx.client());
  for (let i=0; i<12; i++) await fx.app(coach, "template_save", { name: `برنامج ${i}`, content: structuredClone(blankContent) });
  for (let i=0; i<11; i++) {
    const member=crypto.randomUUID();
    await fx.db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,'synthetic-only',now())", [member, `${member}@example.test`]);
    await fx.call(member,"init_profile", { display_name:"مدرب فريق", requested_role:"coach" });
    await fx.call(coach,"ec_team_invite", { email_address:`${member}@example.test`, member_role:"trainer" });
  }
  const state=await fx.call<{features:string[];limits:Record<string,unknown>}>(coach,"ec_subscription");
  expect(state.limits).toEqual({ clients:null, templates:null, coaches:null });
  for (const feature of state.features) expect(await fx.call(coach,"ec_require",{feature})).toBe(true);
  expect(state.features).toContain("branches");
  await fx.linkTrainee(clients[54]);
  expect(await fx.call<string[]>(trainee,"ec_client_features",{client:clients[54]})).toContain("programs");
  const current = (await fx.db.query("select to_jsonb(a) - 'quota_revision' as a from public.ec_accounts a where owner_id=$1", [coach])).rows[0];
  const before = structuredClone(original) as {a:Record<string,unknown>}; delete before.a.quota_revision;
  expect(current).toEqual(before);
  const foreign=await fx.client(other);
  await expect(fx.app(coach,"client_save",{id:foreign,name:"Unauthorized",email:"foreign@example.test",phone:""})).rejects.toThrow();
  await fx.db.query("select public.ec_billing_runtime(true)");
  await expect(fx.client()).rejects.toThrow(/حد المتدربين/);
  await expect(fx.call(coach,"ec_require",{feature:"branches"})).rejects.toThrow();
  expect((await fx.db.query("select count(*)::int as n from public.clients where coach_id=$1",[coach])).rows[0]).toEqual({n:55});
  await fx.db.query("select public.ec_billing_runtime(false)");
});
it("does not reconcile expiries, queue reminders, expose invoices, or allow billing mutations", async () => {
  expect(await fx.call(coach,"ec_quote",{plan_code:"pro"})).toEqual({});
  expect((await fx.db.query("select public.ec_billing_jobs() as j")).rows[0]).toEqual({j:[]});
  expect((await fx.db.query("select public.ec_reconcile() as j")).rows[0]).toEqual({j:{skipped:true}});
  expect((await fx.db.query("select public.ec_queue_package_expiry() as n")).rows[0]).toEqual({n:0});
  expect(await fx.call(coach,"ec_billing_overview")).toEqual({});
  await expect(fx.db.query("select public.ec_billing_start($1,'pro',null,'Coach','2026-11-15.6')",[coach])).rejects.toThrow(/billing_disabled/);
  await expect(fx.call(coach,"ec_billing_runtime",{enabled:true})).rejects.toThrow(/permission denied/);
  await expect(fx.call(null,"ec_billing_runtime",{enabled:true})).rejects.toThrow(/permission denied/);
});
