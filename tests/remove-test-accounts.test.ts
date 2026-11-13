import { afterAll, beforeAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { openDatabase, passwordHash, rpcLocal, seedDatabase, LOCAL_IDS } from "@/lib/local-db";
import type { PGlite } from "@electric-sql/pglite";

// The launch cleanup script is run by hand in Supabase; this proves it removes every
// test identity with its data (including immutable payments) and leaves real data intact.
let db: PGlite;
const realCoach = "77777777-7777-4777-8777-777777777777";
const demo = "55555555-5555-4555-8555-555555555555";
let realClient = "";
const script = readFile("supabase/scripts/remove-test-accounts.sql", "utf8");
const steps = async () => {
  const sql = await script;
  const [preview, remove] = sql.split("-- =============================== STEP 2: DELETE");
  return { preview: preview.slice(preview.indexOf("with targets")), remove: remove.slice(remove.indexOf("begin;")) };
};

beforeAll(async () => {
  db = await openDatabase();
  await seedDatabase(db); // coach@, coach2@, trainee@example.test with programs, subscriptions, payments…
  await db.exec("create schema if not exists storage; create table storage.objects(bucket_id text, name text);");
  for (const [id, email, role] of [[realCoach, "owner@coach.sa", "coach"], [demo, "test@demo.easycoach.test", "coach"]]) {
    await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())", [id, email, passwordHash("Synthetic!2026")]);
    await rpcLocal(db, id, "init_profile", { display_name: "حساب", requested_role: role });
  }
  const app = <T,>(uid: string, command: string, payload: unknown) => rpcLocal<T>(db, uid, "app_command", { command, payload });
  realClient = (await app<{ id: string }>(realCoach, "client_save", { name: "متدرب حقيقي", email: "real-client@coach.sa", phone: "" })).id;
  const sub = await app<{ id: string }>(realCoach, "subscription_create", { client_id: realClient, name: "شهري", start_date: "2026-11-01", end_date: "2026-12-01", price: 500 });
  await app(realCoach, "payment_add", { id: crypto.randomUUID(), subscription_id: sub.id, amount: 500, method: "bank", paid_date: "2026-11-01", reference: "REAL-1" });
  // A real coach's trainee who once logged in with a synthetic account.
  await db.query("update public.clients set trainee_user_id=$1 where id=$2", [LOCAL_IDS.trainee, realClient]);
  const demoClient = (await app<{ id: string }>(demo, "client_save", { name: "متدرب العرض", email: "demo-client@example.test", phone: "" })).id;
  await app(demo, "subscription_create", { client_id: demoClient, name: "شهري", start_date: "2026-11-01", end_date: "2026-12-01", price: 100 });
  await db.query("insert into storage.objects values('coach-videos',$1)", [`${LOCAL_IDS.coach}/video-1`]);
}, 120000);
afterAll(async () => { await db?.close(); });

it("previews accounts, row counts and storage files without changing anything", async () => {
  const { preview } = await steps();
  const rows = (await db.query<{ kind: string; item: string }>(preview)).rows;
  expect(rows.filter((r) => r.kind === "account").map((r) => r.item).sort()).toEqual(
    ["coach2@example.test", "coach@example.test", "test@demo.easycoach.test", "trainee@example.test"],
  );
  expect(rows.find((r) => r.kind.startsWith("storage file"))?.item).toBe(`coach-videos / ${LOCAL_IDS.coach}/video-1`);
  expect(Number(rows.find((r) => r.kind === "payments")?.item)).toBeGreaterThan(0);
  expect((await db.query("select 1 from auth.users")).rows.length).toBe(5);
});

it("deletes every test account with all data and keeps the real coach untouched", async () => {
  const { remove } = await steps();
  await db.exec(remove);
  const users = await db.query<{ email: string }>("select email from auth.users order by email");
  expect(users.rows.map((u) => u.email)).toEqual(["owner@coach.sa"]);
  const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);
  expect(await count("select count(*) n from public.profiles")).toBe(1);
  expect(await count("select count(*) n from public.clients")).toBe(1);
  expect(await count("select count(*) n from public.payments")).toBe(1);
  expect(await count("select count(*) n from public.subscriptions")).toBe(1);
  expect(await count("select count(*) n from public.programs")).toBe(0);
  expect(await count("select count(*) n from private.client_purges")).toBe(0);
  const client = await db.query<{ trainee_user_id: string | null; coach_id: string }>("select trainee_user_id, coach_id from public.clients where id=$1", [realClient]);
  expect(client.rows[0]).toEqual({ trainee_user_id: null, coach_id: realCoach });
  // Payments stay immutable outside the purge.
  await expect(db.query("delete from public.payments")).rejects.toThrow("السجل ثابت");
});
