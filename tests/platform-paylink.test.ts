import { beforeAll, afterAll, expect, it } from "vitest";
import { coach, other, fixtureDatabase } from "./helpers/db";
import { POLICY_VERSION } from "@/lib/legal";
let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
let attempt:{id:string;invoice_id:string;order_no:string};
beforeAll(async()=>{
 fx=await fixtureDatabase({platformManaged:true});
 await fx.db.exec("update public.ec_config set provider_verified=true,tax_mode='not_registered'");
 await fx.db.query("select public.ec_billing_start($1,'pro','0501234567','Fictional owner',$2)",[coach,POLICY_VERSION]);
 await fx.db.query("update public.ec_accounts set trial_start=now()-interval '337 hours',trial_end=now()-interval '1 hour' where owner_id=$1",[coach]);
 attempt=(await fx.db.query<{r:typeof attempt}>("select public.ec_billing_prepare($1,'pro',49900) as r",[coach])).rows[0].r;
});
afterAll(async()=>{await fx?.db.close();});
it("retires old collection and browser reservation entry points",async()=>{
 await expect(fx.call(coach,"ec_paylink_reserve",{plan_code:"pro",expected_total:49900,accepted_version:POLICY_VERSION})).rejects.toThrow(/permission denied/);
 const grants=await fx.db.query<{allowed:boolean}>("select has_function_privilege(r.oid,p.oid,'EXECUTE') as allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where r.rolname in ('anon','authenticated','service_role') and n.nspname='public' and p.proname like 'paylink_%'");
 expect(grants.rows.every(r=>!r.allowed)).toBe(true);
});
it("does not expose another owner's payment URLs or private attempts",async()=>{
 expect(await fx.call(other,"ec_billing_overview")).toMatchObject({invoices:[],notifications:[]});
 await expect(fx.call(coach,"ec_billing_settle",{attempt:attempt.id,transaction:"forged",order_no:attempt.order_no,amount:49900,currency_code:"SAR",provider_status:"Paid",provider_paid_at:null,errors:[]})).rejects.toThrow(/permission denied/);
 await expect(fx.db.transaction(async tx=>{await tx.exec("set local role authenticated");await tx.exec("select * from private.ec_payment_attempts");})).rejects.toThrow(/permission denied/);
});
it("rejects missing/foreign currency and keeps mismatched references in audit review",async()=>{
 const r=await fx.db.query<{r:string}>("select public.ec_billing_settle($1,'tx-foreign',$2,49900,'USD','paid',null,'[]') as r",[attempt.id,attempt.order_no]);
 expect(r.rows[0].r).toBe("review");
 expect((await fx.db.query("select raw_provider_status,status,amount_halalas from private.ec_payment_attempts where id=$1",[attempt.id])).rows[0]).toMatchObject({raw_provider_status:"paid",status:"review",amount_halalas:49900});
 expect(await fx.call(coach,"ec_subscription")).not.toMatchObject({subscription_state:"ACTIVE"});
 expect((await fx.db.query("select id from public.payments")).rows).toHaveLength(0);
});
