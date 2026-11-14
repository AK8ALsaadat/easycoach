import { expect,it } from "vitest";
import { coach,fixtureDatabase } from "./helpers/db";
it("fails closed for absent amount, empty transaction and absent paid confirmation",async()=>{
 const fx=await fixtureDatabase({platformManaged:true});
 try{
  await fx.db.query("update public.ec_accounts set billing_plan='starter',status='past_due',recurring_ref='fixture-ref',locked_price_halalas=29900,locked_total_halalas=29900,period_end=now()-interval '1 day' where owner_id=$1",[coach]);
  const id=(await fx.db.query<{id:string}>("insert into public.ec_invoices(owner_id,cycle_start,cycle_end,plan,amount_halalas,provider_order) select owner_id,period_end,period_end+interval '1 month',billing_plan,locked_total_halalas,'fixture-order' from public.ec_accounts where owner_id=$1 returning id",[coach])).rows[0].id;
  const settle=async(event:string,tx:string,amount:number|null,paid:boolean|null)=>(await fx.db.query<{outcome:string}>("select public.ec_record_payment($1,$2,$3,$4,'SAR',$5) as outcome",[event,id,tx,amount,paid])).rows[0].outcome;
  expect(await settle("missing-amount","fixture-tx",null,true)).toBe("review");
  expect(await settle("empty-tx","",29900,true)).toBe("review");
  expect(await settle("missing-confirmation","fixture-tx",29900,null)).toBe("failed");
  expect(await fx.call(coach,"ec_subscription")).toMatchObject({status:"past_due",effective_plan:"free"});
  expect(await settle("paid","fixture-tx",29900,true)).toBe("applied");
  expect(await fx.call(coach,"ec_subscription")).toMatchObject({status:"active",effective_plan:"starter"});
 }finally{await fx.db.close();}
});
