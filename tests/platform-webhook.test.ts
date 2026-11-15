import { beforeAll,afterAll,expect,it,vi } from "vitest";
import { coach,fixtureDatabase } from "./helpers/db";
import { POLICY_VERSION } from "@/lib/legal";
import { PaylinkError } from "@/lib/paylink/client";
const mock=vi.hoisted(()=>({call:vi.fn(),getInvoice:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/platform/billing-store",()=>({billingCall:mock.call}));
vi.mock("@/lib/platform/payment-config",()=>({platformMerchant:()=>({getInvoice:mock.getInvoice}),paymentsEnabled:()=>true,paymentReadiness:vi.fn()}));
import { POST } from "@/app/api/payments/paylink/webhook/route";
let fx:Awaited<ReturnType<typeof fixtureDatabase>>;
let remote:{transactionNo:string;orderNumber:string;currency:string;orderStatus:string;rawStatus:string;amount:number;paidAt:string;paymentErrors:unknown[]};
beforeAll(async()=>{
 vi.stubEnv("PAYLINK_WEBHOOK_SECRET","fictional-hook-secret");
 fx=await fixtureDatabase({platformManaged:true});
 await fx.db.exec("update public.ec_config set provider_verified=true,tax_mode='not_registered'");
 await fx.db.query("select public.ec_billing_start($1,'pro','0501234567','Fictional owner',$2)",[coach,POLICY_VERSION]);
 await fx.db.query("update public.ec_accounts set trial_start=now()-interval '337 hours',trial_end=now()-interval '1 hour' where owner_id=$1",[coach]);
 const p=(await fx.db.query<{r:{id:string;order_no:string}}>("select public.ec_billing_prepare($1,'pro',49900) as r",[coach])).rows[0].r;
 await fx.db.query("select public.ec_billing_attach($1,'webhook-test','https://paylink.sa/fictional')",[p.id]);
 remote={transactionNo:"webhook-test",orderNumber:p.order_no,currency:"SAR",orderStatus:"Pending",rawStatus:"Pending",amount:499,paidAt:new Date().toISOString(),paymentErrors:[]};
 mock.getInvoice.mockImplementation(async()=>remote);
 mock.call.mockImplementation(async(name:string,args:Record<string,unknown>={})=>{
  const entries=Object.entries(args);return(await fx.db.query<{r:unknown}>(`select public.${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) as r`,entries.map(([,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].r;
 });
});
afterAll(async()=>{vi.unstubAllEnvs();await fx?.db.close();});
const request=(secret="fictional-hook-secret")=>new Request("https://easycoach.test/api/payments/paylink/webhook",{method:"POST",headers:{authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({transactionNo:"webhook-test",merchantOrderNumber:remote.orderNumber,orderStatus:"Paid",amount:1})});
it("authenticates provider calls before touching invoices",async()=>{
 expect((await POST(request("wrong"))).status).toBe(401);expect(mock.getInvoice).not.toHaveBeenCalled();
});
it("uses Get Invoice, ignoring the redirect/webhook's claimed paid status and amount",async()=>{
 expect((await POST(request())).status).toBe(200);
 expect(await fx.call(coach,"ec_subscription")).toMatchObject({subscription_state:"AWAITING_PAYMENT"});
 expect(mock.getInvoice).toHaveBeenCalledWith("webhook-test");
});
it("replayed and concurrent paid webhooks activate exactly one 30-day period",async()=>{
 remote={...remote,orderStatus:"Paid",rawStatus:"Paid"};
 const responses=await Promise.all([POST(request()),POST(request())]);expect(responses.map(r=>r.status)).toEqual([200,200]);
 const first=await fx.call<{paid_until:string;subscription_state:string}>(coach,"ec_subscription");
 expect(first.subscription_state).toBe("ACTIVE");expect(Date.parse(first.paid_until)).toBe(Date.parse(remote.paidAt)+30*86400000);
 await POST(request());expect((await fx.call(coach,"ec_subscription")).paid_until).toBe(first.paid_until);
 expect((await fx.db.query("select id from public.ec_invoices where status='paid'")).rows).toHaveLength(1);
});
it("auth/permission errors remove verification, retain paid access, and expose no raw provider error",async()=>{
 const log=vi.spyOn(console,"error").mockImplementation(()=>{});
 mock.getInvoice.mockRejectedValueOnce(new PaylinkError("auth_failed",403));
 const result=await POST(request());expect(result.status).toBe(503);expect(result.headers.get("content-type")).toContain("application/json");expect(await result.json()).toEqual({success:false,error:"verification_unavailable"});
 expect((await fx.db.query<{provider_verified:boolean}>("select provider_verified from public.ec_config")).rows[0].provider_verified).toBe(false);
 expect(await fx.call(coach,"ec_subscription")).toMatchObject({subscription_state:"PROVIDER_NOT_READY",effective_plan:"pro"});
 expect(JSON.stringify(log.mock.calls)).not.toContain("fictional-hook-secret");log.mockRestore();
});
