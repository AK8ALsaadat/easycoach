import { spawn } from "node:child_process";
import { mkdir,writeFile,readFile } from "node:fs/promises";
import { randomUUID,randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
// Explicit opt-in, fixed project, isolated owner, no login/mail/payment operation.
if(!process.argv.includes("--remote"))throw Error("Pass --remote to run isolated PostgreSQL concurrency checks");
const project="trlgsugychocgwtnmzej",owner=randomUUID();
const directory=path.resolve(".local-dev/platform-release/remote-"+owner);await mkdir(directory,{recursive:true});
async function query(name,sql,readOnly=false){
 const file=path.join(directory,name+".sql");await writeFile(file,sql);
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,["node_modules/supabase/dist/supabase.js","db","query","--remote="+project,"--file",file,"--output","json",readOnly?"--read-only":"--yes"],{stdio:["ignore","pipe","pipe"],windowsHide:true});
  let out="",err="";child.stdout.on("data",data=>{out+=data;});child.stderr.on("data",data=>{err+=data;});
  child.on("error",reject);child.on("close",async code=>{
   await writeFile(path.join(directory,name+".private.log"),out+"\n"+err);
   if(code)reject(Object.assign(Error("Database step failed: "+name),{diagnostic:out+err}));
   else{try{resolve(JSON.parse(out));}catch{reject(Error("Invalid CLI response: "+name));}}
  });
 });
}
const actor=`set local role authenticated;select set_config('request.jwt.claim.sub','${owner}',true);`;
const insert=(label,isolation="read committed",lock=null)=>`begin isolation level ${isolation};set local statement_timeout='25s';${actor}
 select count(*) from public.clients where coach_id='${owner}';
 ${lock===null?"":`select pg_advisory_xact_lock(${lock});`}
 select public.app_command('client_save',jsonb_build_object('name','Fictional concurrency client','email','${label}-${owner}@example.invalid','phone',''));commit;`;
async function count(){return Number((await query("count-"+randomUUID(),`select count(*)::int as total from public.clients where coach_id='${owner}'`,true)).rows[0].total);}
try{
 const readiness=await query("readiness",await readFile("supabase/checks/platform_readiness.sql","utf8"),true);
 assert(readiness.rows[0].ready,"Platform schema/privileges/campaign flags are not ready");
 await query("prepare",`begin;
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data,raw_app_meta_data,aud,role) values('${owner}','ec-quota-${owner}@example.invalid','',now(),'{}','{}','authenticated','authenticated');
 insert into public.profiles(id,name,email,role) values('${owner}','Fictional platform concurrency QA','ec-quota-${owner}@example.invalid','coach') on conflict(id) do nothing;
 ${actor}
 select public.app_command('client_save',jsonb_build_object('name','Fictional quota fixture','email','fixture-'||n||'-${owner}@example.invalid','phone','')) from generate_series(1,4) n;commit;`);
 const normal=await Promise.allSettled([query("read-committed-a",insert("rc-a")),query("read-committed-b",insert("rc-b"))]);
 assert.equal(normal.filter(result=>result.status==="fulfilled").length,1,"Read Committed must admit exactly one fifth client");
 assert.equal(await count(),5);
 const refused=normal.find(result=>result.status==="rejected");assert.match(refused.reason.diagnostic,/P0403|حد المتدربين/);
 await query("reset-to-four",`delete from public.clients where coach_id='${owner}' and email in ('rc-a-${owner}@example.invalid','rc-b-${owner}@example.invalid');`);
 const key=randomBytes(4).readUInt32BE()%2_000_000_000+1;
 const barrier=query("repeatable-read-barrier",`begin;set local statement_timeout='25s';select pg_advisory_xact_lock(${key});select pg_sleep(15);commit;`);
 // Capture rejection immediately so a coordinator failure cannot be unhandled.
 const coordinator=barrier.then(()=>({ok:true}),()=>({ok:false}));
 let held=false;
 for(let attempt=0;attempt<3&&!held;attempt++){
  const result=await query("barrier-observed-"+attempt,`select exists(select 1 from pg_locks where locktype='advisory' and classid=0 and objid=${key} and granted) as held`,true);held=result.rows[0].held;
 }
 assert(held,"Concurrency barrier must be visible before both snapshots start");
 const repeatable=await Promise.allSettled([query("repeatable-read-a",insert("rr-a","repeatable read",key)),query("repeatable-read-b",insert("rr-b","repeatable read",key))]);
 assert.equal(repeatable.filter(result=>result.status==="fulfilled").length,1,"Repeatable Read must not overrun the quota");
 assert.equal(await count(),5);
 const stale=repeatable.find(result=>result.status==="rejected");assert.match(stale.reason.diagnostic,/40001|serialize|concurrent update/);
 assert((await coordinator).ok,"Concurrency coordinator must finish cleanly");
 console.log(JSON.stringify({project,readCommitted:"passed",repeatableRead:"passed",maxActiveClients:5,realCharges:0}));
}catch(error){console.error("FAIL: "+error.message);process.exitCode=1;}
finally{
 try{
  await query("cleanup",`begin;delete from public.clients where coach_id='${owner}';delete from public.audit where coach_id='${owner}';delete from public.profiles where id='${owner}';delete from auth.users where id='${owner}';commit;`);
  const clean=await query("cleanup-check",`select not exists(select 1 from auth.users where id='${owner}') and not exists(select 1 from public.clients where coach_id='${owner}') and not exists(select 1 from public.ec_accounts where owner_id='${owner}') as clean`,true);
  assert(clean.rows[0].clean);console.log("PASS: isolated hosted fixtures fully removed.");
 }catch(error){console.error("Fixture cleanup needs attention: "+error.message+"; owner "+owner);process.exitCode=1;}
}
