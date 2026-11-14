import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { fixtureDatabase, coach, other, publishable } from "./helpers/db";
import { blankContent } from "@/lib/model";
import { passwordHash } from "@/lib/local-db";

/**
 * Two coach accounts in one browser.
 *
 * Every coach page — today, clients, library, finance, settings — and the
 * sidebar counter are rendered from a single management_snapshot for the signed
 * in identity, so "the library page showed another account" can only mean the
 * snapshot or a write escaped its account. These assertions pin both ends: what
 * each account can read, and who a write made as one account belongs to.
 */
let fixture: Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async () => {
  fixture = await fixtureDatabase();
});
afterAll(async () => {
  await (fixture.db as PGlite).close();
});

const workout = () => publishable(structuredClone(blankContent));

it("keeps each account's library, roster and counters to itself", async () => {
  await fixture.client(coach, "متدرب الحساب الأول");
  await fixture.manage(other, "template_save_typed", {
    name: "قالب الحساب الثاني",
    content: workout(),
    kind: "workout",
  });
  await fixture.app(other, "exercise_save", {
    name: "تمرين الحساب الثاني",
    description: "",
    video: "",
  });

  const first = await fixture.call<Record<string, unknown[]>>(coach, "management_snapshot");
  const second = await fixture.call<Record<string, unknown[]>>(other, "management_snapshot");

  // The sidebar counter and the roster read the same array as every page.
  expect(first.clients).toHaveLength(1);
  expect(second.clients).toHaveLength(0);

  const names = (rows: unknown[]) => rows.map((row) => (row as { name: string }).name);
  expect(names(second.templates)).toContain("قالب الحساب الثاني");
  expect(names(first.templates)).not.toContain("قالب الحساب الثاني");
  expect(names(second.exercises)).toContain("تمرين الحساب الثاني");
  expect(names(first.exercises)).not.toContain("تمرين الحساب الثاني");
});

it("attributes a library write to the acting account only", async () => {
  const saved = await fixture.manage<{ id: string }>(coach, "template_save_typed", {
    name: "قالب الحساب الأول",
    content: workout(),
    kind: "workout",
  });
  const owner = await fixture.db.query<{ coach_id: string }>("select coach_id from public.templates where id=$1", [saved.id]);
  expect(owner.rows[0].coach_id).toBe(coach);

  // The other account cannot see it, rename it or delete it.
  const theirs = await fixture.call<Record<string, unknown[]>>(other, "management_snapshot");
  expect(theirs.templates.map((row) => (row as { id: string }).id)).not.toContain(saved.id);
  await expect(fixture.manage(other, "template_rename", { id: saved.id, name: "محاولة من حساب ثاني" })).rejects.toThrow();
  const still = await fixture.db.query<{ name: string }>("select name from public.templates where id=$1", [saved.id]);
  expect(still.rows[0].name).toBe("قالب الحساب الأول");
});

it("refuses a second account for an address that already has one", async () => {
  const shared = "shared-address@example.test";
  const firstId = crypto.randomUUID();
  await fixture.db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())", [
    firstId,
    shared,
    passwordHash("FictionalTest!2026"),
  ]);
  await fixture.call(firstId, "init_profile", { display_name: "الحساب الأصلي", requested_role: "coach" });

  // First line of defence: Auth itself holds one identity per address.
  await expect(
    fixture.db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())", [
      crypto.randomUUID(),
      shared,
      passwordHash("FictionalTest!2026"),
    ]),
  ).rejects.toThrow(/users_email_key|duplicate key/);

  // Second line: whatever produced a profile row for an address that already
  // has an account — a legacy row, a provider link, a changed address — a new
  // workspace is never started beside it.
  const secondId = crypto.randomUUID();
  await fixture.db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())", [
    secondId,
    "second-identity@example.test",
    passwordHash("FictionalTest!2026"),
  ]);
  await fixture.db.query("update public.profiles set email=$1 where id=$2", ["second-identity@example.test", firstId]);
  await expect(
    fixture.call(secondId, "init_profile", { display_name: "حساب مكرر", requested_role: "coach" }),
  ).rejects.toThrow(/حساب مسبقًا/);

  const rows = await fixture.db.query<{ count: string }>("select count(*)::text as count from public.profiles where lower(email)=$1", [
    "second-identity@example.test",
  ]);
  expect(rows.rows[0].count).toBe("1");
});
