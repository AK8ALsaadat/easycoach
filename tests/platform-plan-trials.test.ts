import { expect,it } from "vitest";
import { coach,fixtureDatabase } from "./helpers/db";
async function setup() {
  const fx=await fixtureDatabase({platformManaged:true});
  await fx.db.exec("update public.ec_config set tax_mode='not_registered',provider_verified=true,reference_prices_approved=true,discount_enabled=true,discount_start=now()-interval '1 day',discount_end=now()+interval '1 day',trial_enabled=true,trial_start=now()-interval '1 day',trial_end=now()+interval '1 day'");
  return fx;
}
it.each([["starter",23920],["pro",39920],["business",55920]] as const)("simulates %s with Business trial then exactly its chosen billing price",async(plan,amount)=>{
  const fx=await setup();
  try{
    const quote=await fx.call(coach,"ec_quote",{plan_code:plan});
    const consent=(await fx.db.query<{id:string}>("insert into public.ec_consents(owner_id,plan,quote) values($1,$2,$3) returning id",[coach,plan,JSON.stringify(quote)])).rows[0].id;
    await fx.db.query("select public.ec_confirm_setup($1,'RP-fixture','method-fixture')",[consent]);
    expect(await fx.call(coach,"ec_subscription")).toMatchObject({billing_plan:plan,effective_plan:"business",status:"trialing",total_halalas:amount});
    await fx.db.query("update public.ec_accounts set trial_start=now()-interval '15 days',trial_end=now()-interval '1 day' where owner_id=$1",[coach]);
    await fx.db.query("select public.ec_reconcile()");
    expect(await fx.call(coach,"ec_subscription")).toMatchObject({effective_plan:"free",status:"past_due"});
    const invoice=(await fx.db.query<{id:string}>("insert into public.ec_invoices(owner_id,cycle_start,cycle_end,plan,amount_halalas,provider_order) select owner_id,trial_end,trial_end+interval '1 month',billing_plan,locked_total_halalas,'order-fixture' from public.ec_accounts where owner_id=$1 returning id",[coach])).rows[0].id;
    await fx.db.query("select public.ec_record_payment('fixture-paid',$1,'fixture-transaction',$2,'SAR',true)",[invoice,amount]);
    expect(await fx.call(coach,"ec_subscription")).toMatchObject({billing_plan:plan,effective_plan:plan,status:"active",total_halalas:amount});
  }finally{await fx.db.close();}
});
it("simulates provider-confirmed trial cancellation without consuming or billing another trial",async()=>{
  const fx=await setup();
  try{
    const quote=await fx.call(coach,"ec_quote",{plan_code:"starter"});
    const consent=(await fx.db.query<{id:string}>("insert into public.ec_consents(owner_id,plan,quote) values($1,'starter',$2) returning id",[coach,JSON.stringify(quote)])).rows[0].id;
    await fx.db.query("select public.ec_confirm_setup($1,'RP-fixture','method-fixture')",[consent]);
    await fx.db.query("select public.ec_confirm_cancel($1,'RP-fixture')",[coach]);
    expect(await fx.call(coach,"ec_subscription")).toMatchObject({effective_plan:"business",cancel_at_period_end:true});
    await fx.db.query("update public.ec_accounts set trial_start=now()-interval '15 days',trial_end=now()-interval '1 day' where owner_id=$1",[coach]);
    await fx.db.query("select public.ec_reconcile()");
    expect(await fx.call(coach,"ec_subscription")).toMatchObject({effective_plan:"free",status:"expired"});
    expect(await fx.call(coach,"ec_quote",{plan_code:"pro"})).toMatchObject({trial_available:false});
    expect((await fx.db.query("select id from public.ec_invoices")).rows).toHaveLength(0);
  }finally{await fx.db.close();}
});
it("rejects a partial price consent even if its total matches",async()=>{
  const fx=await setup();
  try{
    const quote=await fx.call<Record<string,unknown>>(coach,"ec_quote",{plan_code:"starter"});delete quote.net_halalas;
    const consent=(await fx.db.query<{id:string}>("insert into public.ec_consents(owner_id,plan,quote) values($1,'starter',$2) returning id",[coach,JSON.stringify(quote)])).rows[0].id;
    await expect(fx.db.query("select public.ec_confirm_setup($1,'RP-fixture','method-fixture')",[consent])).rejects.toThrow(/new consent/);
    expect(await fx.call(coach,"ec_subscription")).toMatchObject({status:"free"});
  }finally{await fx.db.close();}
});
