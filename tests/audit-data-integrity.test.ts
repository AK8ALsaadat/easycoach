import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { openDatabase, rpcLocal, LOCAL_IDS } from "@/lib/local-db";
import type { Snapshot } from "@/lib/model";
import { blankContent as defaultContent, type Program } from "@/lib/model";
import { publishable } from "./helpers/db";
const blankContent = publishable(defaultContent);

let db: PGlite;
let client: string;
const coach = LOCAL_IDS.coach, other = LOCAL_IDS.other;
const command = <T = unknown>(user: string, command: string, payload: unknown) =>
  rpcLocal<T>(db, user, "app_command", { command, payload });
const manage = <T = unknown>(user: string, command: string, payload: unknown) =>
  rpcLocal<T>(db, user, "management_command", { command, payload });

beforeAll(async () => {
  db = await openDatabase();
  for (const uid of [coach, other]) {
    await db.query("insert into auth.users values($1,$2,'synthetic',now())", [uid, uid + "@example.test"]);
    await rpcLocal(db, uid, "init_profile", { display_name: "Audit coach", requested_role: "coach" });
  }
  client = (await command<{ id: string }>(coach, "client_save", {
    name: "Synthetic trainee", email: "audit-retries@example.test", phone: "",
  })).id;
});
afterAll(async () => { await db?.close(); });

it("replays a response-lost coaching record once and rejects altered data under the same operation id", async () => {
  const payload = { id: randomUUID(), client_id: client, kind: "measurement", entry_date: "2026-01-01", payload: { weight: 80 } };
  const original = await manage<{ id: string }>(coach, "record_save", payload);
  const replay = await manage<{ id: string }>(coach, "record_save", payload);
  expect(replay.id).toBe(original.id);
  await expect(manage(coach, "record_save", { ...payload, payload: { weight: 79 } })).rejects.toThrow();
  const persisted = await db.query<{ count: number; weight: string }>(
    "select count(*)::int as count, max((payload->>'weight')::numeric) as weight from public.coaching_records where id=$1", [payload.id],
  );
  expect(persisted.rows[0].count).toBe(1);
  expect(Number(persisted.rows[0].weight)).toBe(80);
});

it("does not let another coach claim a successful record's retry key or target its trainee", async () => {
  const payload = { id: randomUUID(), client_id: client, kind: "message", entry_date: "2026-01-01", payload: { text: "Synthetic private message" } };
  await manage(coach, "record_save", payload);
  await expect(manage(other, "record_save", payload)).rejects.toThrow();
  const data = await rpcLocal<Snapshot>(db, other, "management_snapshot");
  expect(data.clients.some(c => c.id === client)).toBe(false);
  expect(data.management?.records.some(r => r.id === payload.id)).toBe(false);
});

it("replayed payment and freeze deliveries do not charge or extend a subscription twice", async () => {
  const sub = await command<{ id: string; end_date: string }>(coach, "subscription_create", {
    client_id: client, name: "Synthetic package", start_date: "2026-01-01", end_date: "2026-01-31", price: 500,
  });
  const payment = { id: randomUUID(), subscription_id: sub.id, amount: 100, method: "cash", paid_date: "2026-01-01", reference: "audit-response-lost" };
  await command(coach, "payment_add", payment);
  await command(coach, "payment_add", payment);
  const freeze = { id: randomUUID(), subscription_id: sub.id, start_date: "2026-01-10", end_date: "2026-01-12" };
  await command(coach, "freeze_apply", freeze);
  await command(coach, "freeze_apply", freeze);
  const data = await rpcLocal<Snapshot>(db, coach, "management_snapshot");
  expect(data.payments.filter(p => p.subscription_id === sub.id)).toHaveLength(1);
  expect(data.freezes.filter(f => f.subscription_id === sub.id)).toHaveLength(1);
  expect(data.subscriptions.find(s => s.id === sub.id)?.end_date).toBe("2026-02-03");
  await expect(command(coach, "payment_add", { ...payment, amount: 200 })).rejects.toThrow();
  expect(Number((await db.query<{ amount: string }>("select amount from public.payments where id=$1", [payment.id])).rows[0].amount)).toBe(100);
});

it("rejects a stale draft overwrite, preserves the current content, and makes an identical response-lost retry safe", async () => {
  const save = (name: string, draftId: string | null, revision: number | null) => command<Program>(coach, "program_save", {
    client_id: client, name, content: blankContent,
    expected_draft_id: draftId, expected_edit_revision: revision,
  });
  const first = await save("Original draft", null, null);
  expect(first.edit_revision).toBe(1);
  const retriedCreation = await save("Original draft", null, null);
  expect(retriedCreation.id).toBe(first.id);
  expect(retriedCreation.edit_revision).toBe(1);
  const newer = await save("Newer draft", first.id, first.edit_revision!);
  expect(newer.edit_revision).toBe(2);
  await expect(save("Stale draft", first.id, first.edit_revision!)).rejects.toThrow("نافذة أخرى");
  const retriedUpdate = await save("Newer draft", first.id, first.edit_revision!);
  expect(retriedUpdate.edit_revision).toBe(2);
  await expect(command(coach, "program_publish", { id: first.id, expected_edit_revision: first.edit_revision })).rejects.toThrow("قبل النشر");
  const snapshot = await rpcLocal<Snapshot>(db, coach, "management_snapshot");
  const current = snapshot.programs.find(p => p.id === first.id)!;
  expect(current.name).toBe("Newer draft");
  expect(current.published_at).toBeNull();
  expect(current.edit_revision).toBe(2);
  await command(coach, "program_publish", { id: first.id, expected_edit_revision: newer.edit_revision });
});

it("rejects a first-save race and detects edits made through compatible legacy callers", async () => {
  const first = await command<Program>(coach, "program_save", {
    client_id: client, name: "First current draft", content: blankContent,
    expected_draft_id: null, expected_edit_revision: null,
  });
  await expect(command(coach, "program_save", {
    client_id: client, name: "Stale empty editor", content: blankContent,
    expected_draft_id: null, expected_edit_revision: null,
  })).rejects.toThrow("نافذة أخرى");
  const legacy = await command<Program>(coach, "program_save", { client_id: client, name: "Explicit legacy replacement", content: blankContent });
  expect(legacy.edit_revision).toBe(first.edit_revision! + 1);
  await expect(command(coach, "program_save", {
    client_id: client, name: "Stale editor after legacy replacement", content: blankContent,
    expected_draft_id: first.id, expected_edit_revision: first.edit_revision,
  })).rejects.toThrow("نافذة أخرى");
  await expect(command(other, "program_save", {
    client_id: client, name: "Foreign coach overwrite", content: blankContent,
    expected_draft_id: legacy.id, expected_edit_revision: legacy.edit_revision,
  })).rejects.toThrow();
  const deliveries = await Promise.allSettled(["Update from tab A", "Update from tab B"].map(name => command(coach, "program_save", {
    client_id: client, name, content: blankContent,
    expected_draft_id: legacy.id, expected_edit_revision: legacy.edit_revision,
  })));
  expect(deliveries.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(deliveries.filter(r => r.status === "rejected")).toHaveLength(1);
  // PGlite queues these calls; this does not replace a two-connection hosted concurrency test.
});
