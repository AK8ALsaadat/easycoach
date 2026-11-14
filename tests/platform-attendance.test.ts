import { beforeAll,afterAll,it,expect } from "vitest";
import { coach,other,trainee,fixtureDatabase } from "./helpers/db";
let fx:Awaited<ReturnType<typeof fixtureDatabase>>;let client:string,sub:string;
beforeAll(async()=>{
 fx=await fixtureDatabase({platformManaged:true});client=await fx.client();await fx.linkTrainee(client);
 sub=(await fx.app<{id:string}>(coach,"subscription_create",{client_id:client,name:"حصص حقيقية",start_date:"2026-01-01",end_date:"2026-12-31",price:300})).id;
});
afterAll(async()=>{await fx?.db.close();});
it("tracks a Free owner's session balance without touching SaaS invoices",async()=>{
 await fx.call(coach,"ec_session_limit",{subscription:sub,sessions:1});
 const id=crypto.randomUUID(),args={subscription:sub,attendance_id:id,attendance_date:"2026-01-02"};
 await fx.call(coach,"ec_attendance",args);await fx.call(coach,"ec_attendance",args);
 const results=await Promise.allSettled(["2026-01-03","2026-01-04"].map(day=>fx.call(coach,"ec_attendance",{subscription:sub,attendance_id:crypto.randomUUID(),attendance_date:day})));
 expect(results.every(result=>result.status==="rejected")).toBe(true);
 expect(await fx.call(trainee,"ec_attendance_page",{client})).toMatchObject([{remaining:0,attended:1}]);
 await expect(fx.call(other,"ec_attendance_page",{client})).rejects.toThrow(/غير مسموح/);
 await expect(fx.call(trainee,"ec_attendance",{...args,attendance_id:crypto.randomUUID()})).rejects.toThrow();
 expect((await fx.db.query("select id from public.ec_invoices")).rows).toHaveLength(0);
});
it("does not leak saved paid programs through either portal or the Data API after downgrade",async()=>{
 // Set up pre-existing paid data using the local administrator, then expire it.
 await fx.db.query("update public.ec_accounts set mode='legacy' where owner_id=$1",[coach]);
 await fx.app(coach,"portal_create",{client_id:client,token_hash:"a".repeat(64),proof_hash:"b".repeat(64)});
 await fx.db.query("update public.ec_accounts set mode='managed' where owner_id=$1",[coach]);
 const portal=await fx.call<{basic_only:boolean;program:null;weights:unknown[];session_packages:unknown[]}>(null,"portal_access",{token_hash:"a".repeat(64),proof:"b".repeat(64)});
 expect(portal).toMatchObject({basic_only:true,program:null,weights:[]});expect(portal.session_packages).toHaveLength(1);
 await expect(fx.call(null,"portal_access",{token_hash:"a".repeat(64),proof:"b".repeat(64),day:"2026-01-02",value:80})).rejects.toThrow(/ترقية/);
 const invalid=await fx.call<{error:string}>(null,"portal_access",{token_hash:"a".repeat(64),proof:"invalid"});
 expect(invalid.error).toBeDefined();
});
