import {beforeAll,afterAll,expect,it} from "vitest";
import {fixtureDatabase,coach,other} from "./helpers/db";
import {POLICY_VERSION} from "@/lib/legal";
let fx:Awaited<ReturnType<typeof fixtureDatabase>>;
let emailUser:string,googleUser:string;
type Event={id:string;name:string;properties:Record<string,unknown>};
const claim=async(owner:string|null,receipt:string|null=null)=>(await fx.db.query<{r:Event[]}>("select public.ec_analytics_claim($1,$2) as r",[owner,receipt])).rows[0].r;
beforeAll(async()=>{fx=await fixtureDatabase({platformManaged:true});});
afterAll(async()=>{await fx?.db.close();});
it("does not backfill conversions on existing accounts or ordinary logins",async()=>{
 expect(await claim(coach)).toEqual([]);expect(await claim(other)).toEqual([]);
});
it("records email attribution at creation and permits a single opaque receipt conversion before email verification",async()=>{
 emailUser=crypto.randomUUID();const attrs={ec_signup:true,marketing_attribution:{utm_source:"tiktok",utm_campaign:"launch",utm_content:"video",ttclid:"click123"}};
 await fx.db.query("insert into auth.users(id,email,encrypted_password,raw_user_meta_data)values($1,'new-email@example.test','fictional-unused-password',$2)",[emailUser,JSON.stringify(attrs)]);
 expect((await fx.db.query("select utm_source,utm_campaign,utm_content,ttclid from public.ec_user_attribution where user_id=$1",[emailUser])).rows[0]).toEqual(attrs.marketing_attribution);
 const hash='a'.repeat(64);await fx.db.query("select public.ec_analytics_issue_receipt($1,$2)",[emailUser,hash]);
 expect(await claim(null,'b'.repeat(64))).toEqual([]);
 const events=await claim(null,hash);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({name:"CompleteRegistration",properties:{content_name:"EasyCoach signup"}});
 expect(await claim(null,hash)).toEqual([]);expect(await claim(emailUser)).toEqual([]);
});
it("Google creation captures the first attribution once and never emits on later logins",async()=>{
 googleUser=crypto.randomUUID();await fx.db.query("insert into auth.users(id,email,encrypted_password,raw_app_meta_data,email_confirmed_at)values($1,'new-google@example.test','fictional-unused-password','{\"provider\":\"google\"}',now())",[googleUser]);
 await fx.db.query("select public.ec_analytics_attach_attribution($1,'{\"utm_source\":\"tiktok\"}')",[googleUser]);
 await fx.db.query("select public.ec_analytics_attach_attribution($1,'{\"utm_source\":\"later-login\"}')",[googleUser]);
 expect((await fx.db.query<{utm_source:string}>("select utm_source from public.ec_user_attribution where user_id=$1",[googleUser])).rows[0].utm_source).toBe("tiktok");
 const [first,second]=await Promise.all([claim(googleUser),claim(googleUser)]);expect(first.length+second.length).toBe(1);expect(await claim(googleUser)).toEqual([]);
});
it("Subscribe cannot be claimed for a pending invoice or a redirect; only verified server settlement queues it once",async()=>{
 await fx.db.exec("update public.ec_config set provider_verified=true,tax_mode='not_registered'");
 await fx.db.query("select public.ec_billing_start($1,'pro','0501234567','Fictional owner',$2)",[coach,POLICY_VERSION]);
 await fx.db.query("update public.ec_accounts set trial_start=now()-interval '337 hours',trial_end=now()-interval '1 hour' where owner_id=$1",[coach]);
 const attempt=(await fx.db.query<{r:{id:string;order_no:string}}>("select public.ec_billing_prepare($1,'pro',49900) as r",[coach])).rows[0].r;
 expect(await claim(coach)).toEqual([]);
 await fx.db.query("select public.ec_billing_settle($1,'pixel-tx',$2,49900,'SAR','Pending',null,'[]')",[attempt.id,attempt.order_no]);expect(await claim(coach)).toEqual([]);
 await fx.db.query("select public.ec_billing_settle($1,'pixel-tx',$2,49900,'SAR','Paid',now(),'[]')",[attempt.id,attempt.order_no]);
 await fx.db.query("select public.ec_billing_settle($1,'pixel-tx',$2,49900,'SAR','Paid',now(),'[]')",[attempt.id,attempt.order_no]);
 const events=await claim(coach);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({name:"Subscribe",properties:{content_name:"EasyCoach subscription",currency:"SAR",value:499}});
 expect(await claim(coach)).toEqual([]);expect(await claim(other)).toEqual([]);
 await expect(fx.call(coach,"ec_analytics_claim",{owner:other,receipt_hash:null})).rejects.toThrow(/permission denied/);
});
