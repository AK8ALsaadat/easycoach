import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openDatabase, rpcLocal, LOCAL_IDS } from "@/lib/local-db";
const state = vi.hoisted(() => ({ db: null as import("@electric-sql/pglite").PGlite | null, user: null as string | null, directory: "" }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server", () => ({ localMode: () => true, localGuard: async () => {}, rpc: (fn: string, args: object) => rpcLocal(state.db!, state.user, fn, args as Record<string, unknown>) }));
vi.mock("@/lib/local-db", async original => ({ ...await original<typeof import("@/lib/local-db")>(), getLocalDatabase: async () => state.db! }));
vi.mock("@/lib/photo-cleanup-files", async original => {
  const actual = await original<typeof import("@/lib/photo-cleanup-files")>();
  return { ...actual, removeProgressPhotoBytes: (job: import("@/lib/photo-cleanup-files").PhotoDeletionJob) => actual.removeProgressPhotoBytes(job, state.directory) };
});
import { cleanDeletedPhoto } from "@/lib/deleted-photo-cleanup";
import { validateDeletionJob } from "@/lib/photo-cleanup-files";
const { coach, other, trainee } = LOCAL_IDS;
let client: string;
const call = <T = unknown>(uid: string | null, fn: string, args = {}) => rpcLocal<T>(state.db!, uid, fn, args);
async function deletedPhoto() {
  const id = randomUUID();
  await state.db!.query("insert into public.progress_photos(id,client_id,coach_id,author_id,entry_date,filename,size,mime,status) values($1,$2,$3,$3,'2026-01-01','synthetic.jpg',3,'image/jpeg','ready')", [id, client, coach]);
  await call(coach, "management_command", { command: "photo_delete", payload: { id } });
  return id;
}
beforeAll(async () => {
  state.db = await openDatabase(); state.directory = await mkdtemp(path.join(os.tmpdir(), "easycoach-photo-cleanup-"));
  for (const [uid, role] of [[coach, "coach"], [other, "coach"], [trainee, "trainee"]]) {
    await state.db.query("insert into auth.users values($1,$2,'synthetic',now())", [uid, uid + "@example.test"]);
    await call(uid, "init_profile", { display_name: "Synthetic account", requested_role: role });
  }
  client = (await call<{ id: string }>(coach, "app_command", { command: "client_save", payload: { name: "Synthetic client", email: "cleanup@example.test", phone: "" } })).id;
  await state.db.query("update public.clients set trainee_user_id=$1 where id=$2", [trainee, client]);
});
afterAll(async () => {
  await state.db?.close();
  if (state.directory.startsWith(path.join(os.tmpdir(), "easycoach-photo-cleanup-"))) await rm(state.directory, { recursive: true, force: true });
});

it("immediately removes an authorized linked trainee's real bytes and safely repeats a completed cleanup", async () => {
  const id = await deletedPhoto(); await writeFile(path.join(state.directory, id), "private-synthetic"); state.user = trainee;
  const derivative = `${id}.clean-${randomUUID()}`, unrelated = `${randomUUID()}.clean-${randomUUID()}`;
  await writeFile(path.join(state.directory, derivative), "private-synthetic"); await writeFile(path.join(state.directory, unrelated), "other-synthetic");
  expect(await cleanDeletedPhoto(id)).toEqual({ found: true, pending: false });
  await expect(readFile(path.join(state.directory, id))).rejects.toThrow();
  await expect(readFile(path.join(state.directory, derivative))).rejects.toThrow();
  expect((await readFile(path.join(state.directory, unrelated))).toString()).toBe("other-synthetic");
  expect((await state.db!.query("select 1 from private.progress_photo_deletions where id=$1", [id])).rows).toHaveLength(0);
  expect(await cleanDeletedPhoto(id)).toEqual({ found: false, pending: false });
});

it("retains failed removals in the queue and refuses another coach's job", async () => {
  const id = await deletedPhoto(); await mkdir(path.join(state.directory, id)); state.user = coach;
  expect(await cleanDeletedPhoto(id)).toEqual({ found: true, pending: true });
  expect((await state.db!.query("select 1 from private.progress_photo_deletions where id=$1", [id])).rows).toHaveLength(1);
  state.user = other; await expect(cleanDeletedPhoto(id)).rejects.toThrow();
});

it("allows a valid scoped portal to finish deletion and rejects invalid proof without touching the file", async () => {
  const key = "c".repeat(64), proof = "d".repeat(64);
  await call(coach, "app_command", { command: "portal_create", payload: { client_id: client, token_hash: key, proof_hash: proof } });
  const id = await deletedPhoto(); await writeFile(path.join(state.directory, id), "private-synthetic"); state.user = null;
  await expect(cleanDeletedPhoto(id, { key, proof: "0".repeat(64) })).rejects.toThrow();
  expect((await readFile(path.join(state.directory, id))).toString()).toBe("private-synthetic");
  expect(await cleanDeletedPhoto(id, { key, proof })).toEqual({ found: true, pending: false });
});

it("denies cross-coach worker and false acknowledgements to ordinary accounts", async () => {
  await expect(call(null, "photo_cleanup_batch", { completed: [], prune_abandoned: true })).rejects.toThrow();
  await expect(call(coach, "photo_cleanup_batch", { completed: [], prune_abandoned: true })).rejects.toThrow();
  await expect(call(coach, "photo_cleanup", { completed: [randomUUID()] })).rejects.toThrow("server");
});

it("bounds abandoned reservation pruning and returned deletion jobs to 100", async () => {
  await state.db!.query("insert into public.progress_photos(id,client_id,coach_id,author_id,entry_date,filename,size,mime,created_at) select gen_random_uuid(),$1,$2,$2,'2026-01-01','synthetic.jpg',3,'image/jpeg',now()-interval '2 days' from generate_series(1,150)", [client, coach]);
  const batch = await state.db!.query<{ jobs: { id: string }[] }>("select public.photo_cleanup_batch('[]',true) as jobs");
  expect(batch.rows[0].jobs.length).toBeLessThanOrEqual(100);
  expect(Number((await state.db!.query<{ count: string }>("select count(*) from public.progress_photos where status='pending'")).rows[0].count)).toBe(50);
});

it("rejects traversal, foreign asset suffixes and malformed cleanup paths before filesystem access", () => {
  const id = randomUUID();
  expect(() => validateDeletionJob({ id, asset_path: `${coach}/${client}/${id}` })).not.toThrow();
  expect(() => validateDeletionJob({ id: "../private", asset_path: `${coach}/${client}/../private` })).toThrow();
  expect(() => validateDeletionJob({ id, asset_path: `${coach}/${client}/${randomUUID()}` })).toThrow();
});
