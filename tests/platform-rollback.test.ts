import { readFile } from "node:fs/promises";
import { expect,it } from "vitest";
import { coach,fixtureDatabase } from "./helpers/db";
it("rolls an unused rollout back transactionally, preserving old RPC behavior",async()=>{
 const fx=await fixtureDatabase({platformManaged:true});
 try{
  await fx.db.exec(await readFile("supabase/rollbacks/20261115100000_platform_subscriptions.down.sql","utf8"));
  expect((await fx.db.query<{table_name:string|null}>("select to_regclass('public.ec_accounts') as table_name")).rows[0].table_name).toBeNull();
  await expect(fx.app(coach,"exercise_save",{name:"تمرين بعد التراجع",description:"",video:""})).resolves.toHaveProperty("id");
 }finally{await fx.db.close();}
});
