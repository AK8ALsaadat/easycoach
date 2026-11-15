import { beforeAll, afterAll, expect, it } from "vitest";
import { coach, other, trainee, fixtureDatabase } from "./helpers/db";
import { POLICY_VERSION } from "@/lib/legal";
let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async()=>{fx=await fixtureDatabase({platformManaged:true});});
afterAll(async()=>{await fx?.db.close();});
const sql=async<T,>(query:string,args:unknown[]=[]) => (await fx.db.query<{r:T}>(query,args)).rows[0].r;
const start=(owner=coach)=>sql<boolean>("select public.ec_billing_start($1,'pro','0501234567','Fictional owner',$2) as r",[owner,POLICY_VERSION]);
const refresh=(owner=coach)=>sql("select public.ec_billing_refresh($1,null) as r",[owner]);
const state=async(owner=coach)=>{await refresh(owner);return fx.call<{subscription_state:string;effective_plan:string;paid_until:string;grace_ends_at:string}>(owner,"ec_subscription");};
type Attempt={id:string;invoice_id:string;order_no:string;created:boolean;amount_halalas:number;};
const prepare=(owner=coach)=>sql<Attempt>("select public.ec_billing_prepare($1,'pro',49900) as r",[owner]);
const settle=(p:Attempt,status="Paid",amount=49900,paidAt:string|null=null,errors:unknown[]=[])=>sql<string>("select public.ec_billing_settle($1,$2,$3,$4,'SAR',$5,$6,$7::jsonb) as r",[p.id,'tx-'+p.id,p.order_no,amount,status,paidAt,JSON.stringify(errors)]);
const trialHours=(hours:number,owner=coach)=>fx.db.query("update public.ec_accounts set trial_start=now()+($2::text||' hours')::interval-interval '336 hours',trial_end=now()+($2::text||' hours')::interval where owner_id=$1",[owner,hours]);
it("starts at NOT_STARTED and protects ownership and browser mutations independently of paid setup",async()=>{
 expect((await state()).subscription_state).toBe("NOT_STARTED");
 await fx.db.exec("update public.ec_config set provider_verified=true");
 await fx.db.exec("update public.ec_config set tax_mode='not_registered'");
 await expect(fx.call(coach,"ec_billing_start",{owner:coach,plan_code:"pro",mobile:"0501234567",customer_name:"x",accepted_version:POLICY_VERSION})).rejects.toThrow(/permission denied/);
 await expect(fx.call(coach,"ec_start_trial_accepted",{plan_code:"pro",accepted_version:POLICY_VERSION})).rejects.toThrow(/permission denied/);
 await expect(fx.call(trainee,"ec_billing_cancel")).rejects.toThrow("owner_required");
 expect((await fx.db.query("select id from public.ec_invoices")).rows).toHaveLength(0);
});
it("NOT_STARTED -> TRIAL_ACTIVE after confirmation; 14 days of Business with no saved method",async()=>{
 expect(await start()).toBe(true);
 expect(await state()).toMatchObject({subscription_state:"TRIAL_ACTIVE",effective_plan:"business"});
 expect(await sql("select extract(epoch from trial_end-trial_start)::int as r from public.ec_accounts where owner_id=$1",[coach])).toBe(336*3600);
 expect(await sql("select recurring_ref is null and payment_method_ref is null as r from public.ec_accounts where owner_id=$1",[coach])).toBe(true);
 expect((await fx.db.query("select id from public.ec_invoices")).rows).toHaveLength(0);
 await expect(start()).rejects.toThrow("trial_used");
});
it("TRIAL_ACTIVE -> TRIAL_ENDING; hourly reconciliation creates at most one reminder per Riyadh day",async()=>{
 await trialHours(72);
 await sql("select public.ec_reconcile() as r");await sql("select public.ec_reconcile() as r");
 expect(await state()).toMatchObject({subscription_state:"TRIAL_ENDING",effective_plan:"business"});
 expect((await fx.db.query("select id from public.ec_billing_notifications where owner_id=$1",[coach])).rows).toHaveLength(1);
 expect(await sql("select subscription_state::text as r from public.ec_accounts where owner_id=$1",[coach])).toBe("TRIAL_ENDING");
});
it("trial end -> AWAITING_PAYMENT: reserve one period, preserve Business grace, and do not activate from pending status",async()=>{
 await trialHours(-1);
 const [first,second]=await Promise.all([prepare(),prepare()]);
 expect(first.created).toBe(true);expect(second.created).toBe(false);expect(second.id).toBe(first.id);
 expect(await state()).toMatchObject({subscription_state:"AWAITING_PAYMENT",effective_plan:"business"});
 expect(await settle(first,"Pending")).toBe("pending");
 expect((await state()).subscription_state).toBe("AWAITING_PAYMENT");
 expect((await fx.db.query("select id from public.ec_invoices")).rows).toHaveLength(1);
});
it("failed/declined remains payable on the same attempt; cancellation allows a new link for the same period",async()=>{
 const p=await prepare();
 expect(await settle(p,"Pending",49900,null,[{errorCode:"51"}])).toBe("failed");
 expect((await state()).subscription_state).toBe("PAYMENT_FAILED");
 expect((await prepare()).id).toBe(p.id);
 expect(await settle(p,"Canceled")).toBe("canceled");
 const next=await prepare();expect(next.id).not.toBe(p.id);expect(next.invoice_id).toBe(p.invoice_id);
 expect((await fx.db.query("select status from private.ec_payment_attempts where invoice_id=$1",[p.invoice_id])).rows).toHaveLength(2);
});
it("AWAITING_PAYMENT -> ACTIVE only for verified matching payment; duplicate event cannot add another 30 days",async()=>{
 const p=await prepare();const paidAt=new Date(Date.now()-60_000).toISOString();
 expect(await settle(p,"Paid",49900,paidAt)).toBe("paid");
 const first=await state();expect(first).toMatchObject({subscription_state:"ACTIVE",effective_plan:"pro"});
 expect(Date.parse(first.paid_until)).toBe(Date.parse(paidAt)+30*86400000);
 expect(await settle(p,"Paid",49900,new Date().toISOString())).toBe("paid");
 expect((await state()).paid_until).toBe(first.paid_until);
 expect(await sql("select raw_provider_status as r from private.ec_payment_attempts where id=$1",[p.id])).toBe("Paid");
 expect((await fx.db.query("select id from public.payments")).rows).toHaveLength(0);
});
it("ACTIVE -> AWAITING_PAYMENT five days before paidUntil; PAST_DUE retains Pro for exactly three days, then SUSPENDED",async()=>{
 await fx.db.query("update public.ec_accounts set period_end=now()+interval '6 days' where owner_id=$1",[coach]);
 await expect(prepare()).rejects.toThrow("period_running");
 await fx.db.query("update public.ec_accounts set period_end=now()+interval '5 days' where owner_id=$1",[coach]);
 await prepare();expect(await state()).toMatchObject({subscription_state:"AWAITING_PAYMENT",effective_plan:"pro"});
 await fx.db.query("update public.ec_accounts set period_end=now()-interval '1 hour' where owner_id=$1",[coach]);
 expect(await state()).toMatchObject({subscription_state:"PAST_DUE",effective_plan:"pro"});
 await fx.db.query("update public.ec_accounts set period_end=now()-interval '72 hours' where owner_id=$1",[coach]);
 expect(await state()).toMatchObject({subscription_state:"SUSPENDED",effective_plan:"free"});
});
it("cancellation never creates a charge, preserves a paid period, then suspends without grace",async()=>{
 await fx.db.query("update public.ec_accounts set period_end=now()+interval '1 day' where owner_id=$1",[coach]);
 const count=await sql("select count(*)::int as r from public.ec_invoices");
 await fx.call(coach,"ec_billing_cancel");expect(await state()).toMatchObject({subscription_state:"CANCELLED",effective_plan:"pro"});
 await expect(prepare()).rejects.toThrow("subscription_cancelled");
 expect(await sql("select count(*)::int as r from public.ec_invoices")).toBe(count);
 await fx.db.query("update public.ec_accounts set period_end=now()-interval '1 second' where owner_id=$1",[coach]);
 expect(await state()).toMatchObject({subscription_state:"SUSPENDED",effective_plan:"free"});
});
it("provider/tax blocking states persist; a mismatched paid amount never activates a period",async()=>{
 await sql("select public.ec_billing_refresh($1,'PROVIDER_NOT_READY') as r",[other]);
 expect((await fx.call(other,"ec_subscription")).subscription_state).toBe("PROVIDER_NOT_READY");
 await sql("select public.ec_billing_refresh($1,'TAX_NOT_CONFIGURED') as r",[other]);
 expect((await fx.call(other,"ec_subscription")).subscription_state).toBe("TAX_NOT_CONFIGURED");
 await start(other);await trialHours(-1,other);const p=await prepare(other);
 expect(await settle(p,"Paid",1)).toBe("review");
 expect((await state(other)).subscription_state).not.toBe("ACTIVE");
 expect(await settle(p,"Paid")).toBe("review");
});
