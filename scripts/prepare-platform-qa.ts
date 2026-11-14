import { openDatabase, seedDatabase, rpcLocal, passwordHash, LOCAL_IDS } from "../lib/local-db.ts";
import path from "node:path";
import os from "node:os";
const directory=path.resolve(process.argv[2]??"");
if(!directory.startsWith(path.join(os.tmpdir(),"easycoach-platform-"))) throw Error("Only an isolated platform QA temp directory is allowed");
const db=await openDatabase(directory);
try{
  await seedDatabase(db);
  const content=(await db.query<{content:unknown}>("select content from public.programs where coach_id=$1 and published_at is not null limit 1",[LOCAL_IDS.coach])).rows[0].content;
  const missing=await db.query<{id:string}>("select c.id from public.clients c where coach_id=$1 and not exists(select 1 from public.programs p where p.client_id=c.id)",[LOCAL_IDS.coach]);
  for(const client of missing.rows){
    const draft=await rpcLocal<{id:string}>(db,LOCAL_IDS.coach,"app_command",{command:"program_save",payload:{client_id:client.id,name:"QA published program",content}});
    await rpcLocal(db,LOCAL_IDS.coach,"app_command",{command:"program_publish",payload:{id:draft.id}});
  }
  const free="44444444-4444-4444-8444-444444444444";
  await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())",[free,"free@example.test",passwordHash("CoachPreview!2026")]);
  await rpcLocal(db,free,"init_profile",{display_name:"Fictional Free QA owner",requested_role:"coach"});
  for(let i=0;i<5;i++) await rpcLocal(db,free,"app_command",{command:"client_save",payload:{name:"Fictional Free client "+i,email:`free-client-${i}@example.test`,phone:""}});
  // A fresh Free owner with room under the client limit, so the coach journey
  // exercises adding a trainee, packages and attendance rather than only limits.
  const journey="55555555-5555-4555-8555-555555555555";
  await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())",[journey,"journey@example.test",passwordHash("CoachPreview!2026")]);
  await rpcLocal(db,journey,"init_profile",{display_name:"Fictional journey QA coach",requested_role:"coach"});
  const trainee=await rpcLocal<{id:string}>(db,journey,"app_command",{command:"client_save",payload:{name:"Fictional journey client",email:"journey-client@example.test",phone:""}});
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const shift=(days:number)=>{const date=new Date(today+"T12:00:00Z");date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
  await rpcLocal(db,journey,"app_command",{command:"subscription_create",payload:{client_id:trainee.id,name:"باقة حضور اصطناعية",start_date:shift(-10),end_date:shift(20),price:500}});
  console.log("Prepared isolated fictional platform accounts; Free has five clients, and the journey coach has one client with an attendance package.");
}finally{await db.close();}
