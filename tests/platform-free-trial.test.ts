import { beforeAll, afterAll, expect, it } from "vitest";
import { coach, other, fixtureDatabase } from "./helpers/db";
import { POLICY_VERSION } from "@/lib/legal";
let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async()=>{fx=await fixtureDatabase({platformManaged:true});});
afterAll(async()=>{await fx?.db.close();});
const start=(owner=coach,version:string|null=POLICY_VERSION)=>fx.db.query("select public.ec_billing_start($1,'pro','0501234567','Fictional owner',$2)",[owner,version]);
it("leaves Free intact while provider and tax are not ready",async()=>{
 expect(await fx.call(coach,"ec_subscription")).toMatchObject({effective_plan:"free",subscription_state:"NOT_STARTED"});
 await expect(start()).rejects.toThrow("provider_not_ready");
 await fx.db.exec("update public.ec_config set provider_verified=true");
 await expect(start()).rejects.toThrow("tax_not_configured");
 await fx.db.exec("update public.ec_config set tax_mode='not_registered'");
});
it("requires current consent and an open campaign, then records acceptance atomically",async()=>{
 await expect(start(coach,"old")).rejects.toThrow("terms_required");
 await fx.db.exec("update public.ec_config set trial_enabled=false");
 await expect(start()).rejects.toThrow("trial_unavailable");
 await fx.db.exec("update public.ec_config set trial_enabled=true");
 await start();
 expect(await fx.call(coach,"ec_subscription")).toMatchObject({effective_plan:"business",subscription_state:"TRIAL_ACTIVE",has_payment_method:false});
 expect((await fx.db.query("select policy_version,plan from public.ec_trial_consents where owner_id=$1",[coach])).rows[0]).toEqual({policy_version:POLICY_VERSION,plan:"pro"});
});
it("keeps consent private and immutable; direct browser start is retired",async()=>{
 await expect(fx.call(coach,"ec_start_trial_accepted",{plan_code:"pro",accepted_version:POLICY_VERSION})).rejects.toThrow(/permission denied/);
 const read=(owner:string)=>fx.db.transaction(async tx=>{
  await tx.exec("set local role authenticated");await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);return(await tx.query("select owner_id from public.ec_trial_consents")).rows;
 });
 expect(await read(coach)).toHaveLength(1);expect(await read(other)).toHaveLength(0);
 await expect(fx.db.transaction(async tx=>{await tx.exec("set local role authenticated");await tx.exec("update public.ec_trial_consents set policy_version='forged'");})).rejects.toThrow(/permission denied/);
});
it("campaign closure preserves the full 336 hours; a second trial is refused",async()=>{
 await fx.db.exec("update public.ec_config set trial_enabled=false");
 expect(await fx.call(coach,"ec_subscription")).toMatchObject({effective_plan:"business"});
 expect((await fx.db.query<{seconds:number}>("select extract(epoch from trial_end-trial_start)::int as seconds from public.ec_accounts where owner_id=$1",[coach])).rows[0].seconds).toBe(336*3600);
 await expect(start()).rejects.toThrow("trial_used");
 await fx.db.exec("update public.ec_config set trial_enabled=true");
});
it("does not migrate legacy accounts and rolls back the start when acceptance cannot be stored",async()=>{
 await fx.db.query("update public.ec_accounts set mode='legacy' where owner_id=$1",[other]);
 await expect(start(other)).rejects.toThrow("owner_required");
 await fx.db.query("update public.ec_accounts set mode='managed' where owner_id=$1",[other]);
 await fx.db.exec("alter table public.ec_trial_consents add constraint qa_block_acceptance check(owner_id<>'"+other+"')");
 await expect(start(other)).rejects.toThrow(/qa_block_acceptance/);
 expect(await fx.call(other,"ec_subscription")).toMatchObject({effective_plan:"free",subscription_state:"NOT_STARTED"});
});
