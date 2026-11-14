import { beforeAll,afterAll,expect,it } from "vitest";
import { coach,other,fixtureDatabase } from "./helpers/db";
let fx:Awaited<ReturnType<typeof fixtureDatabase>>;
let first:string,second:string,branch:string;
beforeAll(async()=>{
 fx=await fixtureDatabase({platformManaged:true});
 // Synthetic paid state. No provider call or real payment occurs in these tests.
 await fx.db.query("update public.ec_accounts set billing_plan='business',status='active',period_start=now(),period_end=now()+interval '1 month',locked_price_halalas=69900,locked_total_halalas=69900 where owner_id=$1",[coach]);
 first=await fx.client();second=await fx.client();
});
afterAll(async()=>{await fx?.db.close();});
it("requires an accepted invitation before team reads and assigns only tenant-owned clients",async()=>{
 branch=await fx.call<string>(coach,"ec_branch_save",{branch:null,branch_name:"فرع الرياض"});
 const email=`${other}@example.test`;
 await fx.call(coach,"ec_team_invite",{email_address:email,member_role:"trainer",branch:null});
 await expect(fx.call(other,"ec_org_page",{owner:coach})).rejects.toThrow(/غير مسموح/);
 await fx.call(other,"ec_team_accept",{owner:coach});
 expect(await fx.call(other,"ec_org_page",{owner:coach})).toMatchObject({clients:[]});
 await fx.call(coach,"ec_assign_client",{client:first,member:other,branch});
 const page=await fx.call<{clients:{id:string}[]}>(other,"ec_org_page",{owner:coach});
 expect(page.clients.map(c=>c.id)).toEqual([first]);
 await expect(fx.call(other,"ec_assign_client",{client:second,member:other})).rejects.toThrow();
 const foreign=await fx.client(other);
 await expect(fx.call(coach,"ec_assign_client",{client:foreign,member:other})).rejects.toThrow(/غير مسموح/);
});
it("restricts branch managers to their branch and denies cross-branch tasks",async()=>{
 await fx.call(coach,"ec_team_invite",{email_address:`${other}@example.test`,member_role:"branch_manager",branch});
 await fx.call(other,"ec_team_accept",{owner:coach});
 expect((await fx.call<{clients:unknown[]}>(other,"ec_org_page",{owner:coach})).clients).toHaveLength(1);
 const args={owner:coach,assignee:other,title:"متابعة التجديد",due:new Date().toISOString()};
 await expect(fx.call(other,"ec_task_save",{...args,client:second})).rejects.toThrow(/غير مسموح/);
 await fx.call(other,"ec_task_save",{...args,client:first});
 await expect(fx.call(other,"ec_task_save",{...args,client:first,assignee:coach})).rejects.toThrow(/مدرب آخر/);
});
it("previews bulk changes, revalidates scope and makes confirmation idempotent",async()=>{
 const preview=await fx.call<{id:string;count:number}>(coach,"ec_bulk_preview",{operation:"assign",body:{clients:[first,second],member:other,branch}});
 expect(preview.count).toBe(2);
 await expect(fx.call(other,"ec_bulk_apply",{preview:preview.id})).rejects.toThrow();
 await fx.call(coach,"ec_bulk_apply",{preview:preview.id});await fx.call(coach,"ec_bulk_apply",{preview:preview.id});
 expect((await fx.call<{clients:unknown[]}>(other,"ec_org_page",{owner:coach})).clients).toHaveLength(2);
 expect((await fx.db.query("select id from public.ec_team_audit where action='bulk_assign'")).rows).toHaveLength(2);
});
it("runs task automation repeatedly without duplicates and queues email without claiming delivery",async()=>{
 await fx.app(coach,"subscription_create",{client_id:first,name:"باقة اختبار",start_date:"2026-11-01",end_date:"2026-11-30",price:300});
 // Move only the synthetic package dates to the test's real clock date.
 await fx.db.query("update public.subscriptions set start_date=(now() at time zone 'Asia/Riyadh')::date-10,end_date=(now() at time zone 'Asia/Riyadh')::date+2 where client_id=$1",[first]);
 await fx.call(coach,"ec_rule_save",{rule:null,event_name:"expiry",threshold_value:3,action_name:"both",enabled:true});
 await fx.db.query("select public.ec_run_automation()");await fx.db.query("select public.ec_run_automation()");
 expect((await fx.db.query("select id from public.ec_tasks where source like 'rule:%'")).rows).toHaveLength(1);
 expect((await fx.db.query("select id from public.ec_email_outbox where kind like 'rule:%' and status='pending'")).rows).toHaveLength(1);
 const report=await fx.call<{active_clients:number;paid_sar:null;outstanding_sar:number}>(coach,"ec_report",{owner:coach,branch});
 expect(report).toMatchObject({active_clients:2,paid_sar:null,outstanding_sar:300});
});
it("counts invited seats including owner and revokes access immediately at downgrade",async()=>{
 await fx.db.query("update public.ec_accounts set billing_plan='pro',locked_price_halalas=49900,locked_total_halalas=49900 where owner_id=$1",[coach]);
 expect(await fx.call(coach,"ec_subscription")).toMatchObject({usage:{coaches:2},limits:{coaches:3}});
 await expect(fx.call(coach,"ec_branch_save",{branch:null,branch_name:"فرع غير مسموح"})).rejects.toThrow(/ترقية/);
 // Branch-manager privileges are a Business feature, even when old assignments remain.
 expect((await fx.call<{clients:unknown[]}>(other,"ec_org_page",{owner:coach})).clients).toHaveLength(0);
 await fx.db.query("update public.ec_accounts set billing_plan='starter',locked_price_halalas=29900,locked_total_halalas=29900 where owner_id=$1",[coach]);
 await expect(fx.call(other,"ec_org_page",{owner:coach})).rejects.toThrow(/ترقية/);
 expect((await fx.db.query("select member_id from public.ec_team where owner_id=$1",[coach])).rows).toHaveLength(1);
});
