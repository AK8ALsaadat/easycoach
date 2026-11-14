import { beforeAll, afterAll, expect, it } from "vitest";
import { coach, other, fixtureDatabase } from "./helpers/db";
import { blankContent } from "@/lib/model";
let fx:Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async()=>{fx=await fixtureDatabase({platformManaged:true});});
afterAll(async()=>{await fx?.db.close();});
const query=async<T>(sql:string,args:unknown[]=[]) => (await fx.db.query<{r:T}>(sql,args)).rows[0].r;
const config=()=>fx.db.exec("update public.ec_config set tax_mode='not_registered',reference_prices_approved=true,discount_enabled=true,discount_start=now()-interval '1 day',discount_end=now()+interval '1 day',trial_enabled=true,trial_start=now()-interval '1 day',trial_end=now()+interval '1 day'");
const state=()=>fx.call<{effective_plan:string;status:string;billing_plan:string;total_halalas:number;trial_end:string}>(coach,"ec_subscription");
async function consent(plan:string){
 const quote=await fx.call(coach,"ec_quote",{plan_code:plan});
 return query<string>("insert into public.ec_consents(owner_id,plan,quote) values($1,$2,$3) returning id as r",[coach,plan,JSON.stringify(quote)]);
}
it("requires actual tax settings and a bounded approved discount campaign",async()=>{
 expect(await fx.call(coach,"ec_quote",{plan_code:"starter"})).toMatchObject({net_halalas:29900,total_halalas:null,discount:false,provider_ready:false});
 await expect(fx.db.exec("update public.ec_config set discount_enabled=true")).rejects.toThrow();
 await config();
 for(const [plan,price] of [["starter",23920],["pro",39920],["business",55920]]) expect(await fx.call(coach,"ec_quote",{plan_code:plan})).toMatchObject({net_halalas:price,total_halalas:price});
 await fx.db.exec("update public.ec_config set tax_mode='exclusive',tax_bps=1500");
 expect(await fx.call(coach,"ec_quote",{plan_code:"starter"})).toMatchObject({net_halalas:23920,vat_halalas:3588,total_halalas:27508});
 await fx.db.exec("update public.ec_config set tax_mode='not_registered'");
});
it("does not start a trial on quote, consent, failed setup or untrusted callback",async()=>{
 const id=await consent("starter");
 await expect(query("select public.ec_confirm_setup($1,'RP-test','method-test') as r",[id])).rejects.toThrow(/not verified/);
 await expect(fx.call(coach,"ec_confirm_setup",{consent_id:id,provider_reference:"RP-test",method_reference:"method-test"})).rejects.toThrow(/permission denied/);
 expect(await state()).toMatchObject({effective_plan:"free",status:"free"});
});
it("simulates trusted setup: Starter billing with 336 hours of Business and a locked price",async()=>{
 // Local SQL simulation only. This is NOT provider evidence or a Paylink call.
 await fx.db.exec("update public.ec_config set provider_verified=true");
 const id=await consent("starter");
 expect(await query("select public.ec_confirm_setup($1,'RP-local-fixture','method-local-fixture') as r",[id])).toBe(true);
 expect(await state()).toMatchObject({effective_plan:"business",billing_plan:"starter",status:"trialing",total_halalas:23920});
 expect(await query("select extract(epoch from trial_end-trial_start)::int as r from public.ec_accounts where owner_id=$1",[coach])).toBe(14*24*60*60);
 expect(await query("select public.ec_confirm_setup($1,'RP-local-fixture','method-local-fixture') as r",[id])).toBe(true);
 await expect(query("select public.ec_confirm_setup($1,'RP-another','method-another') as r",[id])).rejects.toThrow(/already used/);
 await fx.db.exec("update public.ec_config set discount_end=now()-interval '1 second'");
 expect(await fx.call(coach,"ec_quote",{plan_code:"starter"})).toMatchObject({net_halalas:23920,discount:true});
 expect(await fx.call(other,"ec_quote",{plan_code:"starter"})).toMatchObject({net_halalas:29900,discount:false});
});
it("queues each reminder once and ends temporary privileges without a page visit or payment",async()=>{
 await fx.db.query("update public.ec_accounts set trial_start=now()-interval '12 days',trial_end=now()+interval '2 days' where owner_id=$1",[coach]);
 await query("select public.ec_reconcile() as r");await query("select public.ec_reconcile() as r");
 expect(await query("select count(*)::int as r from public.ec_email_outbox where owner_id=$1",[coach])).toBe(1);
 await fx.db.query("update public.ec_accounts set trial_start=now()-interval '13 days 12 hours',trial_end=now()+interval '12 hours' where owner_id=$1",[coach]);
 await query("select public.ec_reconcile() as r");await query("select public.ec_reconcile() as r");
 expect(await query("select count(*)::int as r from public.ec_email_outbox where kind='trial_1_day'")).toBe(1);
 await fx.db.query("update public.ec_accounts set trial_start=now()-interval '15 days',trial_end=now()-interval '1 day' where owner_id=$1",[coach]);
 expect(await state()).toMatchObject({effective_plan:"free",status:"past_due"});
 await query("select public.ec_reconcile() as r");
 expect(await state()).toMatchObject({effective_plan:"free",status:"past_due"});
});
let invoice:string;
it("applies only a linked verified payment at the selected plan price and handles retries/order",async()=>{
 invoice=await query<string>("insert into public.ec_invoices(owner_id,cycle_start,cycle_end,plan,amount_halalas,provider_order) select owner_id,trial_end,trial_end+interval '1 month',billing_plan,locked_total_halalas,'fixture-order' from public.ec_accounts where owner_id=$1 returning id as r",[coach]);
 const settle=(event:string,amount:number,currency="SAR",paid=true)=>query("select public.ec_record_payment($1,$2,'fixture-tx',$3,$4,$5) as r",[event,invoice,amount,currency,paid]);
 expect(await settle("wrong-currency",23920,"USD")).toBe("review");
 expect(await settle("wrong-amount",69900)).toBe("review");
 expect(await state()).toMatchObject({effective_plan:"free"});
 expect(await settle("paid",23920)).toBe("applied");
 expect(await state()).toMatchObject({effective_plan:"starter",billing_plan:"starter",status:"active"});
 const end=await query("select period_end as r from public.ec_accounts where owner_id=$1",[coach]);
 expect(await settle("paid",23920)).toBe("duplicate");
 expect(await settle("late-failure",23920,"SAR",false)).toBe("duplicate");
 expect(await query("select period_end as r from public.ec_accounts where owner_id=$1",[coach])).toEqual(end);
 expect(await query("select count(*)::int as r from public.ec_invoices where status='paid'")).toBe(1);
});
it("limits Starter templates and rolls back import overflow atomically",async()=>{
 for(let n=0;n<10;n++) await fx.app(coach,"template_save",{name:`قالب رقم ${n}`,content:structuredClone(blankContent)});
 await expect(fx.app(coach,"template_save",{name:"قالب زائد",content:structuredClone(blankContent)})).rejects.toThrow(/حد القوالب/);
 const rows=Array.from({length:31},(_,i)=>({name:`متدرب ${i}`,email:`overflow-${i}@example.test`,phone:""}));
 await expect(fx.app(coach,"import_clients",{rows,overwrite:false})).rejects.toThrow(/حد المتدربين/);
 expect(await query("select count(*)::int as r from public.clients where coach_id=$1",[coach])).toBe(0);
});
it("retains data but locks paid operations at cancellation/expiry and never repeats a trial",async()=>{
 await query("select public.ec_confirm_cancel($1,'RP-local-fixture') as r",[coach]);
 expect(await state()).toMatchObject({effective_plan:"starter"});
 await fx.db.query("update public.ec_accounts set period_end=now()-interval '1 second' where owner_id=$1",[coach]);
 await query("select public.ec_reconcile() as r");
 expect(await state()).toMatchObject({effective_plan:"free",status:"expired"});
 expect(await query("select count(*)::int as r from public.templates where coach_id=$1",[coach])).toBe(10);
 await expect(fx.app(coach,"template_save",{name:"مقفل",content:structuredClone(blankContent)})).rejects.toThrow();
 expect(await fx.call(coach,"ec_quote",{plan_code:"starter"})).toMatchObject({net_halalas:29900,discount:false,trial_available:false});
});
