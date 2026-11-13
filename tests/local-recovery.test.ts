import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { openDatabase, rpcLocal, LOCAL_IDS } from "@/lib/local-db";
import { blankContent, type Snapshot } from "@/lib/model";

it("restores a real database backup into a new database with records, ownership and RLS intact", async () => {
  const source = await openDatabase();
  let backup: Blob;
  let clientId = "";
  let programId = "";
  let migrationCount = 0;
  try {
    for (const user of [LOCAL_IDS.coach, LOCAL_IDS.other]) {
      await source.query("insert into auth.users values($1,$2,'synthetic',now())", [user, user + "@recovery.example.test"]);
      await rpcLocal(source, user, "init_profile", { display_name: "Recovery synthetic coach", requested_role: "coach" });
    }
    clientId = (await rpcLocal<{ id: string }>(source, LOCAL_IDS.coach, "app_command", { command: "client_save", payload: { name: "Recovery trainee", email: "recovery@example.test", phone: "" } })).id;
    programId = (await rpcLocal<{ id: string }>(source, LOCAL_IDS.coach, "app_command", { command: "program_save", payload: { client_id: clientId, name: "Recovery program", content: blankContent } })).id;
    migrationCount = Number((await source.query<{ count: number }>("select count(*) as count from private.app_migrations")).rows[0].count);
    backup = await source.dumpDataDir("gzip");
    expect(backup.size).toBeGreaterThan(0);
  } finally { await source.close(); }

  const restored = new PGlite({ loadDataDir: backup! });
  try {
    const owner = await rpcLocal<Snapshot>(restored, LOCAL_IDS.coach, "management_snapshot");
    expect(owner.clients.find(client => client.id === clientId)?.email).toBe("recovery@example.test");
    expect(owner.programs.find(program => program.id === programId)?.content).toEqual(blankContent);
    expect((await rpcLocal<Snapshot>(restored, LOCAL_IDS.other, "management_snapshot")).clients).toHaveLength(0);
    await expect(rpcLocal(restored, LOCAL_IDS.other, "app_command", { command: "program_publish", payload: { id: programId } })).rejects.toThrow();
    const migration = await restored.query<{ count: number }>("select count(*) as count from private.app_migrations");
    expect(Number(migration.rows[0].count)).toBe(migrationCount);
    await expect(restored.transaction(async transaction => {
      await transaction.exec("set local role anon");
      await transaction.exec("select * from public.clients");
    })).rejects.toThrow();
  } finally { await restored.close(); }
});
