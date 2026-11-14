import { beforeAll, afterAll, expect, it } from "vitest";
import { coach, other, fixtureDatabase, publishable } from "./helpers/db";
import { blankContent, type Snapshot } from "@/lib/model";
import { portalTheme } from "@/lib/platform/portal-theme";
let fx:Awaited<ReturnType<typeof fixtureDatabase>>;
const clients:string[]=[];
beforeAll(async()=>{
  fx=await fixtureDatabase({platformManaged:true});
  await fx.db.query("update public.ec_accounts set billing_plan='business',status='active',period_end=now()+interval '1 month',locked_price_halalas=69900,locked_total_halalas=69900 where owner_id=$1",[coach]);
  for(let index=0;index<65;index++)clients.push(await fx.client());
});
afterAll(async()=>{await fx?.db.close();});
async function nutrition(client:string,carbs:number){
  const payload={calories:1140+4*carbs,protein:150,carbs,fat:60,text:"هدف شخصي",calories_mode:"auto"};
  const id=crypto.randomUUID();
  await fx.db.query("insert into public.coaching_records(id,client_id,coach_id,kind,entry_date,payload,author_id,source_key) values($1::uuid,$2,$3,'nutrition_target',(now() at time zone 'Asia/Riyadh')::date,$4,$3,$1::uuid::text)",[id,client,coach,JSON.stringify(payload)]);
  return payload;
}
it("paginates the actual workspace under RLS and never changes the transaction's identity",async()=>{
  const page=await fx.call<Snapshot>(coach,"ec_workspace_page");
  expect(page.clients).toHaveLength(50);expect(page.profile?.id).toBe(coach);
  expect(page.page_info).toMatchObject({total_active_clients:65,client_count:50});
  const next=await fx.call<Snapshot>(coach,"ec_workspace_page",{after_client:page.page_info!.next_client});
  expect(next.clients).toHaveLength(15);
  expect(new Set([...page.clients,...next.clients].map(client=>client.id)).size).toBe(65);
  const foreign=await fx.call<Snapshot>(other,"ec_workspace_page",{target:clients[0]});expect(foreign.clients).toHaveLength(0);
  // GUC scope is transaction-local: an ordinary full export remains complete.
  expect((await fx.call<Snapshot>(coach,"management_snapshot")).clients).toHaveLength(65);
  const searched=await fx.call<Snapshot>(coach,"ec_workspace_page",{search_text:page.clients[0].email});
  expect(searched.clients.map(client=>client.id)).toEqual([page.clients[0].id]);
});
it("lets an accepted assigned coach edit/publish with stale-write and retry protection",async()=>{
  await expect(fx.call(other,"ec_team_program_context",{owner:coach,target:clients[0]})).rejects.toThrow();
  await fx.call(coach,"ec_team_invite",{email_address:`${other}@example.test`,member_role:"trainer"});
  await fx.call(other,"ec_team_accept",{owner:coach});
  await fx.call(coach,"ec_assign_client",{client:clients[0],member:other});
  const media=crypto.randomUUID();
  await fx.app(coach,"media_reserve",{id:media,filename:"fixture.mp4",size:100,mime:"video/mp4"});
  await fx.app(coach,"media_ready",{id:media});
  expect(await fx.call(other,"media_access",{asset:media})).toHaveProperty("id",media);
  await nutrition(clients[0],225);
  const body=publishable(structuredClone(blankContent));
  const args={owner:coach,target:clients[0],program_name:"برنامج الفريق",body,expected_id:null,expected_revision:null};
  const saved=await fx.call<{id:string;edit_revision:number}>(other,"ec_team_program_save",args);
  expect(saved).toMatchObject({content:{nutrition:{calories:2040}}});
  expect(await fx.call(other,"ec_team_program_save",args)).toMatchObject({id:saved.id,edit_revision:saved.edit_revision});
  const changed={...args,program_name:"برنامج معدّل",expected_id:saved.id,expected_revision:saved.edit_revision};
  const latest=await fx.call<{id:string;edit_revision:number}>(coach,"ec_team_program_save",changed);
  await expect(fx.call(other,"ec_team_program_save",{...changed,program_name:"تعديل قديم"})).rejects.toThrow(/تغيرت المسودة/);
  await expect(fx.call(other,"ec_team_program_save",{...args,target:clients[1]})).rejects.toThrow(/نطاق/);
  await nutrition(clients[0],265);
  const publish={owner:coach,program:latest.id,expected_revision:latest.edit_revision};
  expect(await fx.call(other,"ec_team_program_publish",publish)).toMatchObject({content:{nutrition:{calories:2200}}});
  await fx.call(other,"ec_team_program_publish",publish);
  const audit=await fx.db.query<{actor_id:string}>("select actor_id from public.ec_team_audit where action='team_program_publish'");
  expect(audit.rows).toEqual([{actor_id:other}]);
  const comparison=await fx.call<{id:string;report:{active_clients:number}}[]>(coach,"ec_coach_comparison",{owner:coach});
  expect(comparison.find(row=>row.id===other)?.report.active_clients).toBe(1);
  expect(comparison.find(row=>row.id===coach)?.report.active_clients).toBe(64);
  await fx.call(coach,"ec_team_deactivate",{member:other});
  await expect(fx.call(other,"ec_team_program_context",{owner:coach,target:clients[0]})).rejects.toThrow(/نطاق/);
  await expect(fx.call(other,"media_access",{asset:media})).rejects.toThrow();
});
it("keeps personal nutrition and strips generic loading in bulk program assignment",async()=>{
  const personal=await nutrition(clients[2],300);
  const content=publishable(structuredClone(blankContent));content.days[0].exercises[0].weight=90;
  const template=await fx.app<{id:string}>(coach,"template_save",{name:"قالب جماعي آمن",content});
  const preview=await fx.call<{id:string}>(coach,"ec_bulk_preview",{operation:"program",body:{clients:[clients[2]],template:template.id}});
  await fx.call(coach,"ec_bulk_apply",{preview:preview.id});
  const draft=(await fx.db.query<{content:typeof content}>("select content from public.programs where client_id=$1 and published_at is null",[clients[2]])).rows[0];
  expect(draft.content.nutrition).toEqual(personal);
  expect(draft.content.days[0].exercises[0]).not.toHaveProperty("weight");
  await expect(fx.call(coach,"ec_bulk_preview",{operation:"assign",body:{clients:[clients[2],clients[2]]}})).rejects.toThrow(/مكرر/);
});
it("paginates tasks beyond 100 and queues Starter package expiry exactly once",async()=>{
  await fx.db.query("update public.ec_accounts set period_end=now()+interval '1 month' where owner_id=$1",[coach]);
  await fx.db.query("insert into public.ec_tasks(owner_id,client_id,assignee_id,title,due_at,source) select $1,$2,$1,'متابعة '||n,now()+make_interval(mins=>n),'qa:'||n from generate_series(1,105) n",[coach,clients[0]]);
  const page=await fx.call<{id:string;due_at:string}[]>(coach,"ec_task_page",{owner:coach});
  expect(page).toHaveLength(100);
  const next=await fx.call<unknown[]>(coach,"ec_task_page",{owner:coach,after_due:page[99].due_at,after_id:page[99].id});expect(next).toHaveLength(5);
  const client=await fx.client(other);
  await fx.db.query("update public.ec_accounts set status='active',billing_plan='starter',locked_price_halalas=29900,locked_total_halalas=29900,period_end=now()+interval '1 month' where owner_id=$1",[other]);
  await fx.db.query("insert into public.subscriptions(coach_id,client_id,name,start_date,end_date,price) values($1,$2,'باقة اختبار',(now() at time zone 'Asia/Riyadh')::date,(now() at time zone 'Asia/Riyadh')::date+2,100)",[other,client]);
  await fx.db.query("select public.ec_queue_package_expiry()");await fx.db.query("select public.ec_queue_package_expiry()");
  expect((await fx.db.query("select id from public.ec_email_outbox where owner_id=$1 and kind like 'package_expiry:%'",[other])).rows).toHaveLength(1);
});
it("validates portal colors, preserves identity fields and removes branding at expiry",async()=>{
  await fx.app(coach,"portal_create",{client_id:clients[1],token_hash:"a".repeat(64),proof_hash:"b".repeat(64)});
  await fx.call(coach,"ec_brand_color",{color:"#12ab45"});
  expect(await fx.call(coach,"ec_client_color",{client:clients[0]})).toBe("#12ab45");
  await expect(fx.call(other,"ec_brand_color",{color:"#ffffff"})).rejects.toThrow(/ترقية/);
  await expect(fx.call(coach,"ec_brand_color",{color:"red;background:url(https://example.test)"})).rejects.toThrow();
  expect(portalTheme("#ffffff")?.["--ui-on-primary"]).toBe("#000000");
  expect(portalTheme("#000000")?.["--ui-on-primary"]).toBe("#ffffff");
  expect(portalTheme("invalid")).toBeUndefined();
  await fx.db.query("update public.ec_accounts set period_end=now()-interval '1 second' where owner_id=$1",[coach]);
  expect(await fx.call(coach,"ec_client_color",{client:clients[0]})).toBeNull();
  expect((await fx.db.query<{portal_color:string}>("select portal_color from public.ec_accounts where owner_id=$1",[coach])).rows[0].portal_color).toBe("#12ab45");
  // Reducing over-limit usage must remain possible, including revoking its portal.
  expect(await fx.manage(coach,"client_archive",{client_id:clients[1],archived:true})).toMatchObject({archived:true});
});
