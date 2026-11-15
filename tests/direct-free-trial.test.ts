import { afterAll, beforeAll, expect, it } from "vitest";
import { coach, other, trainee, fixtureDatabase } from "./helpers/db";
import { POLICY_VERSION } from "@/lib/legal";
let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
const sql = async <T = Record<string, unknown>>(query: string, args: unknown[] = []) => (await fx.db.query<{ r: T }>(query, args)).rows[0]?.r;
const start = (id = coach, version = POLICY_VERSION) => sql("select public.ec_billing_start($1,'pro',null,'Direct trial',$2) as r", [id,version]);
beforeAll(async()=>{fx=await fixtureDatabase({platformManaged:true});});
afterAll(async()=>{await fx?.db.close();});
it("starts a full 14-day trial without a phone, merchant approval, credentials, or tax configuration",async()=>{
  expect(await sql("select provider_verified as r from public.ec_config")).toBe(false);
  expect(await start()).toBe(true);
  expect(await fx.call(coach,"ec_subscription")).toMatchObject({status:"trialing",effective_plan:"business",billing_mobile:null,has_payment_method:false,total_halalas:null});
  expect(await sql("select extract(epoch from trial_end-trial_start)::int as r from public.ec_accounts where owner_id=$1",[coach])).toBe(336*3600);
  expect(await sql("select count(*)::int as r from public.ec_invoices")).toBe(0);
});
it("does not extend or repeat an existing trial, even for simultaneous requests",async()=>{
  const before=await fx.call(coach,"ec_subscription");
  await expect(start()).rejects.toThrow("trial_used");
  expect((await fx.call(coach,"ec_subscription")).trial_end).toBe(before.trial_end);
  const results=await Promise.allSettled([start(other),start(other)]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(await sql("select count(*)::int as r from public.ec_trial_consents where owner_id=$1",[other])).toBe(1);
});
it("keeps owner verification, current acceptance, and service-only enrollment mandatory",async()=>{
  await expect(start(trainee)).rejects.toThrow("owner_required");
  await expect(fx.call(coach,"ec_billing_start",{owner:coach,plan_code:"pro",mobile:null,customer_name:"x",accepted_version:POLICY_VERSION})).rejects.toThrow(/permission denied/);
  const id=crypto.randomUUID();
  await fx.db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,'fictional',now())",[id,`${id}@example.test`]);
  await fx.call(id,"init_profile",{display_name:"Unverified fixture",requested_role:"coach"});
  await expect(start(id,"outdated")).rejects.toThrow("terms_required");
  await fx.db.query("update auth.users set email_confirmed_at=null where id=$1",[id]);
  await expect(start(id)).rejects.toThrow("owner_required");
});
it("uses real tax configuration when it becomes available later; a trial never invents VAT or bypasses paid gates",async()=>{
  await fx.db.exec("update public.ec_config set tax_mode='exclusive',tax_bps=1500,vat_number='300000000000003'");
  expect(await fx.call(coach,"ec_quote",{plan_code:"pro"})).toMatchObject({total_halalas:57385,vat_halalas:7485});
  await expect(sql("select public.ec_billing_prepare($1,'pro',57385) as r",[coach])).rejects.toThrow("mobile_required");
  await sql("select public.ec_billing_contact($1,'0501234567','Owner') as r",[coach]);
  await expect(sql("select public.ec_billing_prepare($1,'pro',57385) as r",[coach])).rejects.toThrow("provider_not_ready");
});
