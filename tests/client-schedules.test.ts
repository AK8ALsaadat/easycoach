import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { openDatabase, rpcLocal, LOCAL_IDS, passwordHash } from "@/lib/local-db";
import type { Snapshot } from "@/lib/model";
import { coachingAlerts } from "@/lib/coaching-alerts";
import { traineeCheckinStatus } from "@/lib/checkin-status";

let db: Awaited<ReturnType<typeof openDatabase>>;
const coach = LOCAL_IDS.coach, other = LOCAL_IDS.other, trainee = LOCAL_IDS.trainee;
const call = <T = Record<string, unknown>>(user: string | null, name: string, args: Record<string, unknown> = {}) => rpcLocal<T>(db, user, name, args);
beforeAll(async () => {
  db = await openDatabase();
  for (const [id, role] of [[coach, "coach"], [other, "coach"], [trainee, "trainee"]]) {
    await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())", [id, id + "@schedule.test", passwordHash("FictionalTest!2026")]);
    await call(id, "init_profile", { display_name: "Schedule test coach", requested_role: role });
  }
});
afterAll(async () => { await db?.close(); });

it("stores per-trainee schedules with coach isolation and only alerts on real measurement/photo records", async () => {
  const first = (await call<{ id: string }>(coach, "app_command", { command: "client_save", payload: { name: "Schedule test one", email: "schedule-one@example.test", phone: "" } })).id;
  const second = (await call<{ id: string }>(coach, "app_command", { command: "client_save", payload: { name: "Schedule test two", email: "schedule-two@example.test", phone: "" } })).id;
  await db.query("update public.clients set trainee_user_id=$1 where id=$2", [trainee, first]);
  await call(coach, "client_schedule_save", { payload: { client_id: first, weight_days: 2, measurement_days: 3, photo_days: 4 } });
  await call(coach, "client_schedule_save", { payload: { client_id: second, weight_days: 5, measurement_days: 6, photo_days: 7 } });
  const schedules = await call<Array<{ client_id: string }>>(coach, "client_schedules_snapshot");
  expect(schedules.map((row) => row.client_id).sort()).toEqual([first, second].sort());
  expect(await call<Array<{ client_id: string }>>(other, "client_schedules_snapshot")).toEqual([]);
  expect(await call<Array<{ client_id: string }>>(trainee, "client_schedules_snapshot")).toEqual([{ client_id: first, weight_days: 2, measurement_days: 3, photo_days: 4 }]);
  await expect(call(other, "client_schedule_save", { payload: { client_id: first, weight_days: 1, measurement_days: 1, photo_days: 1 } })).rejects.toThrow();
  const rawToken = randomUUID().replaceAll("-", "").padEnd(64, "a"), pin = "123456";
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const proof = createHash("sha256").update(rawToken + ":" + pin).digest("hex");
  await call(coach, "app_command", { command: "portal_create", payload: { client_id: first, token_hash: tokenHash, proof_hash: proof } });
  expect(await call(null, "portal_schedule_snapshot", { token_hash: tokenHash, proof })).toMatchObject({ client_id: first, weight_days: 2, measurement_days: 3, photo_days: 4 });
  expect(await call(null, "portal_schedule_snapshot", { token_hash: tokenHash, proof: "0".repeat(64) })).toBeNull();

  const data = await call<Snapshot>(coach, "management_snapshot");
  data.management!.schedules = [{ client_id: first, weight_days: 1, measurement_days: 2, photo_days: 2 }];
  data.clients.find((client) => client.id === first)!.created_at = "2026-11-01T12:00:00Z";
  data.management!.records.push({ id: randomUUID(), client_id: first, coach_id: coach, kind: "measurement", entry_date: "2026-11-01", payload: { weight: 82, historical_only: true }, author_id: coach, author_type: "coach", source_key: "historical", reviewed_at: null, coach_feedback: "", read_at: null, created_at: "2026-11-01T12:00:00Z" });
  data.management!.progress_photos.push({ id: randomUUID(), client_id: first, entry_date: "2026-11-10", filename: "pending.webp", status: "pending", angle: "front", consented_at: null, created_at: "2026-11-10T12:00:00Z" });
  data.management!.records.push({ id: randomUUID(), client_id: first, coach_id: coach, kind: "measurement", entry_date: "2026-11-09", payload: { waist: 80 }, author_id: coach, author_type: "coach", source_key: "actual-measure", reviewed_at: null, coach_feedback: "", read_at: null, created_at: "2026-11-09T12:00:00Z" });
  data.management!.progress_photos.push({ id: randomUUID(), client_id: first, entry_date: "2026-11-09", filename: "ready.webp", status: "ready", angle: "front", consented_at: "2026-11-09T12:00:00Z", created_at: "2026-11-09T12:00:00Z" });
  const alerts = coachingAlerts(data, "2026-11-11");
  expect(alerts.some((alert) => alert.clientId === first && alert.kind === "measurement")).toBe(true);
  expect(alerts.some((alert) => alert.clientId === first && alert.kind === "photo")).toBe(true);
  data.management!.schedules = [{ client_id: first, weight_days: 7, measurement_days: 2, photo_days: 2 }];
  const status = traineeCheckinStatus(first, "2026-11-11", [{ id: "w", client_id: first, entry_date: "2026-11-10", weight: 80, updated_at: "2026-11-10T12:00:00Z" }], data.management!.records, data.management);
  expect(status.find((item) => item.kind === "weight")?.due).toBe(false);
  expect(status.find((item) => item.kind === "measurement")?.due).toBe(true);
  expect(status.find((item) => item.kind === "photo")?.due).toBe(true);
});
