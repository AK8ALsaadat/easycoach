import {beforeAll,afterAll,expect,it} from "vitest";
import {coach,fixtureDatabase} from "./helpers/db";
let fx:Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async()=>{fx=await fixtureDatabase({platformManaged:true});});
afterAll(async()=>{await fx?.db.close();});
it("fails clearly when scheduler extensions are unavailable locally",async()=>{
 await expect(fx.db.query("select private.ec_invoke_hourly_billing()")).rejects.toThrow("scheduler extensions are unavailable");
});
it("requires a protected secret before dispatching any request",async()=>{
 // Synthetic local stubs only. Production uses encrypted Supabase Vault and pg_net.
 await fx.db.exec(`create schema vault;create schema net;
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 create table private.qa_scheduler_requests(id bigint generated always as identity,url text,headers jsonb,timeout_ms integer);
 create function net.http_get(url text,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
 declare result bigint;begin insert into private.qa_scheduler_requests(url,headers,timeout_ms)values(url,headers,timeout_milliseconds)returning id into result;return result;end $$;`);
 await expect(fx.db.query("select private.ec_invoke_hourly_billing()")).rejects.toThrow("secret is not configured");
});
it("dispatches only the fixed protected application endpoint and never places secrets in a cron command",async()=>{
 const secret="fictional-local-scheduler-secret-not-real";
 await fx.db.query("insert into vault.decrypted_secrets values('easycoach_subscription_cron_secret',$1)",[secret]);
 await fx.db.query("select private.ec_invoke_hourly_billing()");
 expect((await fx.db.query("select url,headers,timeout_ms from private.qa_scheduler_requests")).rows).toEqual([{url:"https://easycoach.space/api/maintenance/subscriptions",headers:{Authorization:"Bearer "+secret},timeout_ms:55000}]);
 await expect(fx.db.transaction(async tx=>{
  await tx.exec("set local role authenticated");await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[coach]);await tx.query("select private.ec_invoke_hourly_billing()");
 })).rejects.toThrow(/permission denied/);
});
