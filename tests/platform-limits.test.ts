import { beforeAll,afterAll,it,expect } from "vitest";
import { coach,other,fixtureDatabase } from "./helpers/db";
import { blankContent } from "@/lib/model";
let fx:Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async()=>{fx=await fixtureDatabase({platformManaged:true});});
afterAll(async()=>{await fx?.db.close();});
async function plan(code:string){await fx.db.query("update public.ec_accounts set status='active',billing_plan=p.code,period_start=now(),period_end=now()+interval '1 month',locked_price_halalas=p.price_halalas,locked_total_halalas=p.price_halalas from public.ec_plans p where owner_id=$1 and p.code=$2",[coach,code]);}
it("enforces Starter 30, Pro 50, and actual unlimited Business without losing records",async()=>{
 await plan("starter");for(let i=0;i<30;i++) await fx.client();
 await expect(fx.client()).rejects.toThrow(/حد المتدربين/);
 await plan("pro");for(let i=0;i<20;i++) await fx.client();
 await expect(fx.client()).rejects.toThrow(/حد المتدربين/);
 await plan("business");for(let i=0;i<25;i++) await fx.client();
 expect(await fx.call(coach,"ec_subscription")).toMatchObject({usage:{clients:75},limits:{clients:null}});
 await fx.db.query("update public.ec_accounts set status='expired' where owner_id=$1",[coach]);
 const ids=(await fx.db.query<{id:string}>("select id from public.clients where coach_id=$1 order by id",[coach])).rows.map(c=>c.id);
 await expect(fx.app(coach,"client_save",{id:ids[0],name:"محاولة دون اختيار",email:"locked@example.test",phone:""})).rejects.toThrow(/مقفل/);
 await expect(fx.call(coach,"ec_select_resources",{clients:ids.slice(0,6),templates:[]})).rejects.toThrow(/حدود الباقة/);
 await fx.call(coach,"ec_select_resources",{clients:ids.slice(0,5),templates:[]});
 await fx.app(coach,"client_save",{id:ids[0],name:"متدرب مختار",email:"chosen@example.test",phone:""});
 await expect(fx.app(coach,"client_save",{id:ids[6],name:"متدرب مقفل",email:"blocked@example.test",phone:""})).rejects.toThrow(/مقفل/);
 expect((await fx.db.query("select id from public.clients where coach_id=$1",[coach])).rows).toHaveLength(75);
 const foreign=await fx.client(other);
 await expect(fx.call(coach,"ec_select_resources",{clients:[foreign],templates:[]})).rejects.toThrow(/غير مسموح/);
});
it("serializes invited-seat reservations and preserves the owner seat",async()=>{
 await plan("pro");
 const users:string[]=[];
 for(let i=0;i<3;i++){
  const id=crypto.randomUUID();users.push(id);
  await fx.db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,'test-only',now())",[id,`${id}@example.test`]);
  await fx.call(id,"init_profile",{display_name:"مدرب اختبار",requested_role:"coach"});
 }
 const results=await Promise.allSettled(users.map(id=>fx.call(coach,"ec_team_invite",{email_address:`${id}@example.test`,member_role:"trainer"})));
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(2);
 expect(await fx.call(coach,"ec_subscription")).toMatchObject({usage:{coaches:3},limits:{coaches:3}});
});
it("permits more than ten private templates in Pro",async()=>{
 await plan("pro");for(let i=0;i<12;i++) await fx.app(coach,"template_save",{name:`قالب اختبار ${i}`,content:structuredClone(blankContent)});
 expect(await fx.call(coach,"ec_subscription")).toMatchObject({usage:{templates:12},limits:{templates:null}});
});
