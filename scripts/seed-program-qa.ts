import { openDatabase, seedDatabase, rpcLocal, LOCAL_IDS, passwordHash } from "../lib/local-db.ts";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
const location = process.env.LOCAL_DB_PATH ?? "./data/qa-program-v3";
if (!location.replaceAll("\\", "/").startsWith("./data/qa-")) throw Error("Synthetic QA databases only");
const db = await openDatabase(location); await seedDatabase(db);
const today = new Date(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())+"T12:00:00Z").getUTCDay();
const exercise = (name: string, catalogId?: string) => ({name,description:"",coachNotes:"توجيه QA: نزول ببطء",video:"",sets:2,reps:"8–12",rest:90,tempo:"3-1-1-0",rpe:8,rir:2,...(catalogId?{catalogId}:{} )});
const nutrition={text:"",calories:1900,protein:140,carbs:200,fat:60,meals:[{name:"الفطور",time:"08:00",foods:"بيض وخبز",calories:500,protein:30,carbs:40,fat:20}]};
const days=[{name:"اليوم الأول",weekday:today,exercises:[exercise("سكوات QA","Barbell_Squat"),exercise("تمرين مخصص QA")]},{name:"اليوم الثاني",weekday:(today+2)%7,exercises:[exercise("ضغط صدر QA","Dumbbell_Bench_Press")]}];
const main=await db.query<{id:string}>("select id from public.clients where trainee_user_id=$1",[LOCAL_IDS.trainee]);
const mainId=main.rows[0].id;
const fixture: Record<string,unknown>={main:mainId};
for(const [scenario,email] of [["rest","rest-qa@example.test"],["unscheduled","unscheduled-qa@example.test"],["invite","invite-qa@example.test"],["pending","pending-qa@example.test"]]){
 const uid=randomUUID();
 await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())",[uid,email,passwordHash("CoachPreview!2026")]);
 await rpcLocal(db,uid,"init_profile",{display_name:`QA ${scenario}`,requested_role:"trainee"});
 if(scenario==="pending")continue;
 const client=await rpcLocal<{id:string}>(db,LOCAL_IDS.coach,"app_command",{command:"client_save",payload:{name:`QA ${scenario}`,email,phone:""}});
 if(scenario!=="invite")await db.query("update public.clients set trainee_user_id=$1 where id=$2",[uid,client.id]);
 else {
  const token=randomBytes(32).toString("hex");fixture.inviteToken=token;
  await rpcLocal(db,LOCAL_IDS.coach,"app_command",{command:"invite_create",payload:{client_id:client.id,token_hash:createHash("sha256").update(token).digest("hex")}});
 }
 const scenarioDays=structuredClone(days);
 if(scenario==="rest")for(const [i,day]of scenarioDays.entries())day.weekday=(today+i+1)%7;
 if(scenario==="unscheduled")for(const day of scenarioDays)delete (day as {weekday?:number}).weekday;
 const plan=await rpcLocal<{id:string}>(db,LOCAL_IDS.coach,"app_command",{command:"program_save",payload:{client_id:client.id,name:`برنامج QA ${scenario}`,content:{days:scenarioDays,nutrition}}});
 await rpcLocal(db,LOCAL_IDS.coach,"app_command",{command:"program_publish",payload:{id:plan.id}});
 fixture[scenario]=client.id;
}
const plan=await rpcLocal<{id:string}>(db,LOCAL_IDS.coach,"app_command",{command:"program_save",payload:{client_id:mainId,name:"برنامج QA الأسبوعي",content:{days,nutrition}}});
await rpcLocal(db,LOCAL_IDS.coach,"app_command",{command:"program_publish",payload:{id:plan.id}});
// A legacy published empty day cannot be created by the current publish action.
// Reproduce that historical data shape in this isolated local fixture only.
await db.transaction(async tx=>{
 await tx.exec("alter table public.programs disable trigger user");
 await tx.query("update public.programs set content=$1 where id=$2",[JSON.stringify({days:[...days,{name:"يوم قديم فارغ",exercises:[]}],nutrition}),plan.id]);
 await tx.exec("alter table public.programs enable trigger user");
});
await mkdir("artifacts/program-qa",{recursive:true});await writeFile("artifacts/program-qa/fixture.json",JSON.stringify(fixture));
await db.close();console.log("Seeded isolated QA fixtures: scheduled, rest, unscheduled, empty day, invitation and unlinked account");
