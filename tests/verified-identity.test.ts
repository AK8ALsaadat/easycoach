import { afterAll, beforeAll, expect, it } from "vitest";
import { fixtureDatabase, coach, other } from "./helpers/db";
import { readFile } from "node:fs/promises";
let fx: Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async () => { fx = await fixtureDatabase(); });
afterAll(async () => { await fx.db.close(); });

it("denies RLS reads and writes from a still-authenticated identity whose email is unconfirmed", async () => {
  const id = await fx.client();
  const otherId = await fx.client(other);
  const visible = () => fx.db.transaction(async tx => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [coach]);
    return (await tx.query<{ id: string }>("select id from public.clients")).rows.map(r => r.id);
  });
  expect(await visible()).toContain(id);
  expect(await visible()).not.toContain(otherId);
  await fx.db.query("update auth.users set email_confirmed_at=null where id=$1", [coach]);
  try {
    expect(await visible()).toEqual([]);
    await expect(fx.app(coach, "client_save", { id, name: "forbidden", email: "blocked@example.test", phone: "" })).rejects.toThrow();
    expect((await fx.db.query<{ name: string }>("select name from public.clients where id=$1", [id])).rows[0].name).toBe("Fictional client");
  } finally { await fx.db.query("update auth.users set email_confirmed_at=now() where id=$1", [coach]); }
  expect(await visible()).toContain(id);
});

it("initializes a verified profile idempotently", async () => {
  await fx.call(coach, "init_profile", { display_name: "حساب موجود", requested_role: "coach" });
  await fx.call(coach, "init_profile", { display_name: "حساب موجود", requested_role: "coach" });
  expect((await fx.db.query("select id from public.profiles where id=$1", [coach])).rows).toHaveLength(1);
});

it("upgrades existing users and policies and restores their exact expressions on rollback", async () => {
  const before = (await fx.db.query("select id,name from public.clients order by id")).rows;
  const down = await readFile("supabase/rollbacks/20261114120000_verified_email_identity.down.sql", "utf8");
  const up = await readFile("supabase/migrations/20261114120000_verified_email_identity.sql", "utf8");
  await fx.db.exec(down);
  const oldPolicies = (await fx.db.query("select schemaname,tablename,policyname,qual,with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname")).rows;
  await fx.db.exec(up);
  expect((await fx.db.query("select id,name from public.clients order by id")).rows).toEqual(before);
  await fx.db.exec(down);
  expect((await fx.db.query("select schemaname,tablename,policyname,qual,with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname")).rows).toEqual(oldPolicies);
  await fx.db.exec(up);
});
