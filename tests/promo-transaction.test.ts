import { openLegacyDatabase as openDatabase } from "./helpers/legacy-db";
import { beforeAll, afterAll, expect, it } from "vitest";
import { rpcLocal, LOCAL_IDS } from "@/lib/local-db";
import { buildPromoDataset, promoId } from "@/scripts/promo-dataset";
import { promoSeedSql, promoCleanupSql, PROMO_RUN } from "@/scripts/promo-seed-sql";
import type { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const email = "owner@example.test";
const data = buildPromoDataset("2026-11-13");
const accounts = data.clients.filter(c => c.accountRequested).map(c => ({ id: promoId("auth:" + c.id), clientId: c.id, email: c.email, passwordHash: "synthetic-test-hash", createdAt: c.joined + "T09:00:00Z" }));
let sentinel: string;
beforeAll(async () => {
  db = await openDatabase();
  await db.exec(`alter table auth.users add column instance_id uuid, add column aud text, add column role text,
   add column raw_app_meta_data jsonb,add column raw_user_meta_data jsonb,add column is_super_admin boolean,
   add column created_at timestamptz,add column updated_at timestamptz,add column confirmation_token text,
   add column recovery_token text,add column email_change_token_new text,add column email_change text,
   add column email_change_token_current text,add column reauthentication_token text;
   create table auth.identities(id uuid primary key,provider_id text,user_id uuid references auth.users(id) on delete cascade,
   identity_data jsonb,provider text,created_at timestamptz,updated_at timestamptz,unique(provider_id,provider));`);
  await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,'synthetic',now())", [LOCAL_IDS.coach, email]);
  await db.query("insert into auth.identities(id,provider_id,user_id,provider) values(gen_random_uuid(),$1::text,$1::uuid,'google')", [LOCAL_IDS.coach]);
  await rpcLocal(db, LOCAL_IDS.coach, "init_profile", { display_name: "مدرب أصلي", requested_role: "coach" });
  sentinel = (await rpcLocal<{ id: string }>(db, LOCAL_IDS.coach, "app_command", { command: "client_save", payload: { name: "متدرب أصلي", email: "original@example.test", phone: "" } })).id;
}, 120000);
afterAll(async () => { await db?.close(); });

it("rolls back the entire dry run including Auth and registry, then seeds atomically without touching existing data", async () => {
  await db.exec(promoSeedSql(data, accounts, email, true));
  expect((await db.query("select * from public.clients")).rows).toHaveLength(1);
  expect((await db.query("select * from auth.users")).rows).toHaveLength(1);
  expect((await db.query("select to_regclass('private.promo_seed_runs') as name")).rows[0]).toEqual({ name: null });
  const collision = accounts.map((account, index) => index === 1 ? { ...account, email } : account);
  await expect(db.exec(promoSeedSql(data, collision, email, false))).rejects.toThrow("Seed auth collision");
  await db.exec("rollback");
  expect((await db.query("select * from auth.users")).rows).toHaveLength(1);
  expect((await db.query("select * from public.clients")).rows).toHaveLength(1);
  await db.exec(promoSeedSql(data, accounts, email, false));
  expect((await db.query("select * from public.clients")).rows).toHaveLength(41);
  expect((await db.query("select * from auth.users")).rows).toHaveLength(6);
  expect((await db.query("select * from public.weight_entries")).rows).toHaveLength(data.summary.weights);
  const snapshot = await rpcLocal<{ clients: { id: string }[] }>(db, accounts[0].id, "app_snapshot");
  expect(snapshot.clients.map(c => c.id)).toEqual([accounts[0].clientId]);
  await expect(rpcLocal(db, accounts[0].id, "app_command", { command: "client_save", payload: { name: "forged", email: "forged@example.test", phone: "" } })).rejects.toThrow();
  await expect(db.exec(promoSeedSql(data, accounts, email, false))).rejects.toThrow("already exists");
  await db.exec("rollback");
}, 120000);

it("cleanup dry-run preserves every seeded row and applied cleanup restores the original account without deleting its trainee", async () => {
  const addedId = promoId("untracked-activity");
  await db.query("insert into public.coaching_records(id,client_id,coach_id,kind,entry_date,payload,author_id,source_key) values($1,$2,$3,'note','2026-11-13','{\"text\":\"Later non-seed note\"}',$3,'untracked')", [addedId, data.clients[0].id, LOCAL_IDS.coach]);
  await expect(db.exec(promoCleanupSql(email, false))).rejects.toThrow("Untracked data");
  await db.exec("rollback");
  expect((await db.query("select * from public.clients")).rows).toHaveLength(41);
  await db.query("delete from public.coaching_records where id=$1", [addedId]);
  await db.exec(promoCleanupSql(email, true));
  expect((await db.query("select * from public.clients")).rows).toHaveLength(41);
  await db.exec(promoCleanupSql(email, false));
  expect((await db.query("select id from public.clients")).rows).toEqual([{ id: sentinel }]);
  expect((await db.query("select id from auth.users")).rows).toEqual([{ id: LOCAL_IDS.coach }]);
  expect((await db.query("select * from public.weight_entries")).rows).toHaveLength(0);
  expect((await db.query("select * from public.coaching_records")).rows).toHaveLength(0);
  expect((await db.query("select * from public.subscriptions")).rows).toHaveLength(0);
  expect((await db.query("select * from public.payments")).rows).toHaveLength(0);
  expect((await db.query("select * from public.audit where client_id<>$1", [sentinel])).rows).toHaveLength(0);
  expect((await db.query("select * from private.promo_seed_rows where run_key=$1", [PROMO_RUN])).rows).toHaveLength(0);
}, 120000);
