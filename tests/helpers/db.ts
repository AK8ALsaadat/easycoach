import type { PGlite } from "@electric-sql/pglite";
import { openDatabase, rpcLocal, LOCAL_IDS, passwordHash } from "@/lib/local-db";

export const coach = LOCAL_IDS.coach;
export const other = LOCAL_IDS.other;
export const trainee = LOCAL_IDS.trainee;

/** Fresh in-memory PostgreSQL with every migration, RLS policy and role applied. */
export async function fixtureDatabase() {
  const db = await openDatabase();
  for (const [id, role] of [
    [coach, "coach"],
    [other, "coach"],
    [trainee, "trainee"],
  ]) {
    await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())", [
      id,
      id + "@example.test",
      passwordHash("FictionalTest!2026"),
    ]);
    await rpcLocal(db, id, "init_profile", { display_name: "Fictional test account", requested_role: role });
  }
  const call = <T = Record<string, unknown>>(user: string | null, name: string, args: Record<string, unknown> = {}) =>
    rpcLocal<T>(db, user, name, args);
  const app = <T = Record<string, unknown>>(user: string, command: string, payload: unknown) =>
    call<T>(user, "app_command", { command, payload });
  const manage = <T = Record<string, unknown>>(user: string, command: string, payload: unknown) =>
    call<T>(user, "management_command", { command, payload });
  async function client(owner = coach, name = "Fictional client", email = `fixture-${crypto.randomUUID()}@example.test`) {
    return (await app<{ id: string }>(owner, "client_save", { name, email, phone: "" })).id;
  }
  async function linkTrainee(clientId: string, user = trainee) {
    await db.query("update public.clients set trainee_user_id=$1 where id=$2", [user, clientId]);
  }
  /** A coach can link one trainee account per client, so tests create fresh accounts. */
  async function newTrainee() {
    const id = crypto.randomUUID();
    await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())", [
      id,
      id + "@example.test",
      passwordHash("FictionalTest!2026"),
    ]);
    await rpcLocal(db, id, "init_profile", { display_name: "Fictional trainee", requested_role: "trainee" });
    return id;
  }
  return { db: db as PGlite, call, app, manage, client, linkTrainee, newTrainee };
}
