import { openLegacyDatabase as openDatabase } from "./helpers/legacy-db";
import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { PGlite } from "@electric-sql/pglite";
import { rpcLocal, LOCAL_IDS } from "@/lib/local-db";
import type { CoachingRecord } from "@/lib/management";
import type { WeightEntry } from "@/lib/model";
import { progressComparisonDates, progressMetricsForDate } from "@/lib/progress-comparison";
import { progressPhotoPreview } from "@/lib/progress-photo-thumbnail";
let db: PGlite; let client: string; let otherClient: string;
const { coach, other, trainee } = LOCAL_IDS;
const rpc = <T = unknown>(uid: string | null, fn: string, args = {}) => rpcLocal<T>(db, uid, fn, args);
const record = async (uid: string, value: object, kind = "measurement") => rpc<CoachingRecord>(uid, "management_command", { command: "record_save", payload: { id: randomUUID(), client_id: client, entry_date: "2026-01-01", kind, payload: value } });
const change = (uid: string | null, row: CoachingRecord, command = "edit", value: Record<string, unknown> = { weight: 81 }, extra = {}) => rpc<CoachingRecord & { deleted?: boolean; error?: string }>(uid, "progress_record_change", { command, target_client: client, record_id: row.id, expected_updated_at: row.updated_at, entry_date: row.entry_date, value, ...extra });
beforeAll(async () => {
  db = await openDatabase();
  for (const [uid, role] of [[coach, "coach"], [other, "coach"], [trainee, "trainee"]]) {
    await db.query("insert into auth.users values($1,$2,'synthetic',now())", [uid, uid + "@example.test"]);
    await rpc(uid, "init_profile", { display_name: "حساب اختبار", requested_role: role });
  }
  client = (await rpc<{ id: string }>(coach, "app_command", { command: "client_save", payload: { name: "متدرب اصطناعي", email: "progress-test@example.test", phone: "" } })).id;
  otherClient = (await rpc<{ id: string }>(other, "app_command", { command: "client_save", payload: { name: "متدرب آخر", email: "other-progress@example.test", phone: "" } })).id;
  await db.query("update public.clients set trainee_user_id=$1 where id=$2", [trainee, client]);
});
afterAll(async () => { await db?.close(); });

it("corrects a trainee measurement with attribution/version history, rejects stale overwrite, and erases revisions on explicit deletion", async () => {
  const original = await record(trainee, { weight: 80, waist: 90, notes: "before" });
  const updated = await change(trainee, original, "edit", { weight: 79, notes: "corrected" });
  expect(updated.author_id).toBe(trainee); expect(updated.modified_by_type).toBe("client"); expect(updated.revision).toBe(2);
  expect((await db.query<{ previous_payload: object }>("select previous_payload from private.coaching_record_versions where record_id=$1", [original.id])).rows[0].previous_payload).toMatchObject({ weight: 80, waist: 90 });
  await expect(change(trainee, original, "edit", { weight: 78 })).rejects.toThrow("نافذة أخرى");
  expect((await change(trainee, original, "edit", { weight: 79, notes: "corrected" })).revision).toBe(2);
  expect((await change(trainee, updated, "delete")).deleted).toBe(true);
  expect((await db.query("select 1 from private.coaching_record_versions where record_id=$1", [original.id])).rows).toHaveLength(0);
});

it("enforces coach/client attribution and changed IDs on the server", async () => {
  const byCoach = await record(coach, { weight: 70 });
  await expect(change(trainee, byCoach)).rejects.toThrow("تحديثاتك فقط");
  await expect(change(other, byCoach)).rejects.toThrow();
  await expect(change(trainee, byCoach, "edit", { weight: 75 }, { target_client: otherClient })).rejects.toThrow();
  expect((await change(coach, byCoach)).modified_by_type).toBe("coach");
  await expect(change(null, byCoach)).rejects.toThrow();
});

it("makes coach review visible without allowing trainees to forge feedback", async () => {
  const original = await record(trainee, { waist: 91 });
  await expect(change(trainee, original, "review", { feedback: "forged" })).rejects.toThrow("للمدرب فقط");
  const reviewed = await change(coach, original, "review", { feedback: "تحديث محفوظ، شكرًا" });
  expect(reviewed.coach_feedback).toBe("تحديث محفوظ، شكرًا"); expect(reviewed.reviewed_at).toBeTruthy(); expect(reviewed.author_id).toBe(trainee);
  expect((await change(coach, original, "review", { feedback: "تحديث محفوظ، شكرًا" })).revision).toBe(reviewed.revision);
});

it("allows scoped portal corrections, rejects another client and invalid proofs without exposing history", async () => {
  const token = "f".repeat(64), proof = "e".repeat(64);
  await rpc(coach, "app_command", { command: "portal_create", payload: { client_id: client, token_hash: token, proof_hash: proof } });
  const byClient = await record(trainee, { weight: 82 });
  expect((await change(null, byClient, "edit", { weight: 81 }, { portal_hash: token, proof })).modified_by_type).toBe("client");
  await expect(change(null, byClient, "edit", { weight: 80 }, { portal_hash: token, proof, target_client: otherClient })).rejects.toThrow();
  expect((await change(null, byClient, "edit", { weight: 80 }, { portal_hash: token, proof: "0".repeat(64) })).error).toBeTruthy();
  await expect(db.transaction(async tx => { await tx.exec("set local role authenticated"); await tx.exec("select * from private.coaching_record_versions"); })).rejects.toThrow();
});

it("validates numeric ranges and dates and orders corrected measurement weights by modification time", async () => {
  const original = await record(trainee, { weight: 70 });
  await expect(change(trainee, original, "edit", { weight: 900 })).rejects.toThrow("القيم");
  await expect(change(trainee, original, "edit", { weight: 71 }, { entry_date: "2999-01-01" })).rejects.toThrow("التاريخ");
  await change(trainee, original, "edit", { weight: 72 });
  const snapshot = await rpc<{ weights: { client_id: string; entry_date: string; weight: string | number }[] }>(coach, "management_snapshot");
  expect(Number(snapshot.weights.find(row => row.client_id === client && row.entry_date === original.entry_date)?.weight)).toBe(72);
});

it("corrects weekly check-ins without letting a trainee forge coach feedback or change author identity", async () => {
  const original = await record(trainee, { sleep: 3, energy: 3, hunger: 3, stress: 2, training_adherence: 70, nutrition_adherence: 75, feedback: "before", questions: "", photo_ids: [] }, "checkin");
  const updated = await change(trainee, original, "edit", { ...original.payload, feedback: "corrected", weight: 78 });
  expect(updated.author_id).toBe(trainee); expect(updated.coach_feedback).toBe(""); expect(updated.payload.feedback).toBe("corrected");
  await expect(change(trainee, updated, "edit", { ...updated.payload, coach_feedback: "forged" })).rejects.toThrow("القيم");
});

it("compares all saved dates including weight-only and measurement-only without mixing trainees or losing sparse same-day values", () => {
  const base: CoachingRecord = { id: "synthetic", coach_id: "coach-a", author_id: null, author_type: "client", source_key: "synthetic", reviewed_at: null, coach_feedback: "", read_at: null, client_id: "a", kind: "measurement", created_at: "2026-01-01T00:00:00Z", entry_date: "2026-01-01", payload: {} };
  const records: CoachingRecord[] = [{ ...base, payload: { waist: 95, calf: 37 } }, { ...base, created_at: "2026-01-01T01:00:00Z", payload: { chest: 103 } }, { ...base, client_id: "b", payload: { waist: 999 } }];
  const weights: WeightEntry[] = [{ id: "synthetic-weight", client_id: "a", entry_date: "2026-01-02", weight: 80, updated_at: "2026-01-02T00:00:00Z" }];
  expect(progressComparisonDates("a", [], records, weights)).toEqual(["2026-01-01", "2026-01-02"]);
  expect(progressMetricsForDate("a", "2026-01-01", records, weights)).toEqual({ waist: 95, calf: 37, chest: 103 });
  expect(progressMetricsForDate("a", "2026-01-02", records, weights)).toEqual({ weight: 80 });
  expect(progressMetricsForDate("a", "2026-01-03", records, weights)).toEqual({});
});

it("creates bounded previews that retain body proportions and strip metadata", async () => {
  const bytes = await sharp({ create: { width: 1600, height: 2400, channels: 3, background: "#678" } }).jpeg().withExif({ IFD0: { Artist: "private" } }).toBuffer();
  const thumb = await progressPhotoPreview(bytes, "thumbnail");
  const full = await progressPhotoPreview(bytes, "comparison");
  const meta = await sharp(thumb).metadata(), comparison = await sharp(full).metadata();
  expect(meta.height).toBe(384); expect(comparison.height).toBe(768); expect(meta.width! / meta.height!).toBeCloseTo(2 / 3, 2); expect(meta.exif).toBeUndefined();
  await expect(progressPhotoPreview(new Uint8Array([255,216,255]), "thumbnail")).rejects.toThrow();
});
