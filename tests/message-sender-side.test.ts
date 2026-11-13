import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { openDatabase, rpcLocal, LOCAL_IDS } from "@/lib/local-db";
import { recordInput } from "@/lib/management";
import { coachingAlerts } from "@/lib/coaching-alerts";
import type { Snapshot } from "@/lib/model";

// One account that is both the coach and the trainee of its own client.
let db: PGlite;
let client = "";
const me = LOCAL_IDS.coach;
const manage = <T,>(command: string, payload: unknown) => rpcLocal<T>(db, me, "management_command", { command, payload });
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const message = (text: string, author_type?: "coach" | "client") =>
  recordInput.parse({ id: randomUUID(), client_id: client, kind: "message", entry_date: today, payload: { text }, ...(author_type ? { author_type } : {}) });
const messages = async () =>
  (await db.query<{ author_type: string; read_at: string | null; text: string }>("select author_type, read_at, payload->>'text' text from public.coaching_records where kind='message' order by created_at")).rows;

beforeAll(async () => {
  db = await openDatabase();
  await db.query("insert into auth.users values($1,'both@example.test','synthetic',now())", [me]);
  await rpcLocal(db, me, "init_profile", { display_name: "مدرب ومتدرب", requested_role: "coach" });
  client = (await rpcLocal<{ id: string }>(db, me, "app_command", { command: "client_save", payload: { name: "أنا", email: "both@example.test", phone: "" } })).id;
  await db.query("update public.clients set trainee_user_id=$1 where id=$2", [me, client]);
}, 120000);
afterAll(async () => { await db?.close(); });

it("records the sender from the portal used, not just the account", async () => {
  await manage("record_save", message("من بوابة المتدرب", "client"));
  await manage("record_save", message("من بوابة المدرب", "coach"));
  expect((await messages()).map((m) => [m.text, m.author_type])).toEqual([["من بوابة المتدرب", "client"], ["من بوابة المدرب", "coach"]]);
});

it("counts the trainee's message in the coach's follow-ups and bell", async () => {
  const snapshot = await rpcLocal<Snapshot>(db, me, "management_snapshot");
  expect(coachingAlerts(snapshot).some((alert) => alert.kind === "message" && alert.clientId === client)).toBe(true);
});

it("marks only the other side's messages as read for each portal", async () => {
  await manage("messages_read", { client_id: client, side: "client" });
  let rows = await messages();
  expect(rows.find((m) => m.author_type === "coach")?.read_at).toBeTruthy();
  expect(rows.find((m) => m.author_type === "client")?.read_at).toBeNull();
  await manage("messages_read", { client_id: client, side: "coach" });
  rows = await messages();
  expect(rows.every((m) => m.read_at)).toBe(true);
  const snapshot = await rpcLocal<Snapshot>(db, me, "management_snapshot");
  expect(coachingAlerts(snapshot).some((alert) => alert.kind === "message")).toBe(false);
});
