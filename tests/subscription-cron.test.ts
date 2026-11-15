import {beforeAll,afterAll,expect,it,vi} from "vitest";
import {coach,fixtureDatabase} from "./helpers/db";
import {POLICY_VERSION} from "@/lib/legal";
const mock=vi.hoisted(()=>({call:vi.fn(),enabled:vi.fn(),create:vi.fn(),get:vi.fn(),auth:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/platform/billing-store",()=>({billingCall:mock.call}));
vi.mock("@/lib/platform/payment-config",()=>({platformMerchant:()=>({auth:mock.auth,createInvoice:mock.create,getInvoice:mock.get}),paymentsEnabled:mock.enabled,paymentReadiness:async()=>({ready:true,blocked:null})}));
import {runBillingJobs} from "@/lib/platform/paylink";
let fx:Awaited<ReturnType<typeof fixtureDatabase>>;
let sequence=0;
const remote=new Map<string,{transactionNo:string;orderNumber:string;currency:string;orderStatus:string;rawStatus:string;amount:number;paymentErrors:never[]}>();
beforeAll(async()=>{
 vi.stubEnv("APP_URL","https://easycoach.test");mock.enabled.mockReturnValue(true);mock.auth.mockResolvedValue("fictional");
 fx=await fixtureDatabase({platformManaged:true});await fx.db.exec("update public.ec_config set provider_verified=true,tax_mode='not_registered'");
 await fx.db.query("select public.ec_billing_start($1,'pro','0501234567','Fictional owner',$2)",[coach,POLICY_VERSION]);
 mock.call.mockImplementation(async(name:string,args:Record<string,unknown>={})=>{
  const e=Object.entries(args);return(await fx.db.query<{r:unknown}>(`select public.${name}(${e.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) as r`,e.map(([,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].r;
 });
 mock.create.mockImplementation(async(input:{orderNumber:string;amount:number})=>{
  const tx='cron-'+(++sequence);remote.set(tx,{transactionNo:tx,orderNumber:input.orderNumber,currency:"SAR",orderStatus:"Pending",rawStatus:"Pending",amount:input.amount,paymentErrors:[]});
  return{transactionNo:tx,url:'https://paylink.sa/'+tx,orderStatus:"Pending"};
 });
 mock.get.mockImplementation(async(tx:string)=>remote.get(tx));
});
afterAll(async()=>{vi.unstubAllEnvs();await fx?.db.close();});
it("does not issue a trial invoice early, then creates exactly one period link at trial end across repeated hourly runs",async()=>{
 expect(await runBillingJobs()).toMatchObject({processed:0,failed:0});expect(mock.create).not.toHaveBeenCalled();
 await fx.db.query("update public.ec_accounts set trial_start=now()-interval '337 hours',trial_end=now()-interval '1 hour' where owner_id=$1",[coach]);
 expect(await runBillingJobs()).toMatchObject({processed:1,failed:0});
 expect(await runBillingJobs()).toMatchObject({processed:1,failed:0});
 expect(mock.create).toHaveBeenCalledTimes(1);expect(mock.create.mock.calls[0][0]).toMatchObject({amount:499,clientMobile:"0501234567"});
 expect(await fx.call(coach,"ec_subscription")).toMatchObject({subscription_state:"AWAITING_PAYMENT",effective_plan:"business"});
});
it("issues the next period five days before expiry and never charges or issues renewals after cancellation",async()=>{
 const p=(await fx.db.query<{id:string;order_no:string}>("select id,order_no from private.ec_payment_attempts order by created_at desc limit 1")).rows[0];
 await fx.db.query("select public.ec_billing_settle($1,'cron-1',$2,49900,'SAR','Paid',now(),'[]')",[p.id,p.order_no]);
 expect(await runBillingJobs()).toMatchObject({processed:0});
 await fx.db.query("update public.ec_accounts set period_end=now()+interval '5 days' where owner_id=$1",[coach]);
 expect(await runBillingJobs()).toMatchObject({processed:1,failed:0});expect(remote.size).toBe(2);
 await fx.call(coach,"ec_billing_cancel");expect(await runBillingJobs()).toMatchObject({processed:0});expect(remote.size).toBe(2);
});
it("PAYMENTS_ENABLED=false skips all invoice issuance",async()=>{
 mock.enabled.mockReturnValue(false);expect(await runBillingJobs()).toEqual({processed:0,disabled:true});expect(mock.create).not.toHaveBeenCalled();
});
