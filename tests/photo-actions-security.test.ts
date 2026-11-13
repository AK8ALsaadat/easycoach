import { beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  asset: { id: "11111111-1111-4111-8111-111111111111", client_id: "22222222-2222-4222-8222-222222222222", coach_id: "33333333-3333-4333-8333-333333333333", size: 1, mime: "image/jpeg", status: "pending" },
  local: false, query: vi.fn(), download: vi.fn(), update: vi.fn(), sign: vi.fn(), finalize: vi.fn(), rpc: vi.fn(), access: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/photo-cleanup", () => ({ cleanPendingPhotos: vi.fn() }));
vi.mock("@/lib/local-db", () => ({ getLocalDatabase: async () => ({ query: mocks.query }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/server", () => ({
  localMode: () => mocks.local,
  hash: () => "a".repeat(64),
  readableError: (error: unknown) => (error as Error).message,
  rpc: mocks.rpc,
}));
vi.mock("@/lib/progress-photos", () => ({
  accessPhoto: mocks.access,
  photoPath: (asset: typeof mocks.asset) => `${asset.coach_id}/${asset.client_id}/${asset.id}`,
}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({
  storage: { from: () => ({ download: mocks.download, update: mocks.update, createSignedUploadUrl: mocks.sign }) },
  rpc: mocks.finalize,
}) }));
import { finishPhoto, photoTicket } from "@/app/photo-actions";

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.asset.status = "pending";
  mocks.local = false;
  mocks.query.mockResolvedValue({ rows: [{ finalized: true }] });
  mocks.asset.size = 1;
  mocks.access.mockResolvedValue(mocks.asset);
  const raw = await sharp({ create: { width: 40, height: 60, channels: 3, background: "#999" } }).jpeg().withExif({ IFD0: { Artist: "Private" } }).toBuffer();
  mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(raw)]), error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.finalize.mockResolvedValue({ data: true, error: null });
  mocks.rpc.mockResolvedValue(mocks.asset);
  mocks.sign.mockResolvedValue({ data: { signedUrl: "https://storage.example.test/upload" }, error: null });
});

it("issues a non-upsert upload ticket, so an existing validated object is not replaceable by it", async () => {
  const result = await photoTicket({ id: mocks.asset.id, client_id: mocks.asset.client_id, entry_date: "2026-11-11", angle: "front", consent_confirmed: true, filename: "front.jpg", mime: "image/jpeg", size: 123 });
  expect(result.ok).toBe(true);
  expect(mocks.sign).toHaveBeenCalledWith(expect.any(String), { upsert: false });
});

it("sanitizes actual storage bytes before marking ready and does not delete/recreate the object", async () => {
  expect((await finishPhoto(mocks.asset.id)).ok).toBe(true);
  const [storagePath, clean, options] = mocks.update.mock.calls[0];
  expect(storagePath).toContain(mocks.asset.id);
  expect(options).toEqual({ contentType: "image/jpeg", cacheControl: "0", upsert: false });
  expect((await sharp(clean).metadata()).exif).toBeUndefined();
  expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.finalize.mock.invocationCallOrder[0]);
});

it("does not claim success after a storage failure and retries finalization without a new record", async () => {
  mocks.update.mockResolvedValueOnce({ error: new Error("temporary storage failure") });
  expect((await finishPhoto(mocks.asset.id)).ok).toBe(false);
  expect(mocks.finalize).not.toHaveBeenCalled();
  expect((await finishPhoto(mocks.asset.id)).ok).toBe(true);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.finalize).toHaveBeenCalledTimes(1);
});

it("retries after a finalize outage and skips rewriting an already-ready asset", async () => {
  mocks.finalize.mockResolvedValueOnce({ error: new Error("temporary database outage") });
  expect((await finishPhoto(mocks.asset.id)).ok).toBe(false);
  const sanitized = mocks.update.mock.calls[0][1] as Buffer;
  mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(sanitized)]), error: null });
  expect((await finishPhoto(mocks.asset.id)).ok).toBe(true);
  mocks.asset.status = "ready";
  vi.clearAllMocks();
  expect((await finishPhoto(mocks.asset.id)).ok).toBe(true);
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.finalize).not.toHaveBeenCalled();
});

it("rejects corrupt uploaded bytes without a ready record", async () => {
  mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([255, 216, 255, 0])]), error: null });
  expect((await finishPhoto(mocks.asset.id)).ok).toBe(false);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.finalize).not.toHaveBeenCalled();
});

it("does not report success if the photo disappeared before finalization", async () => {
  mocks.finalize.mockResolvedValue({ data: false, error: null });
  expect((await finishPhoto(mocks.asset.id)).ok).toBe(false);
});

it("atomically replaces a real local upload with sanitized bytes before marking it ready", async () => {
  mocks.local = true;
  mocks.asset.id = randomUUID();
  const directory = path.join(process.cwd(), "data/progress-photos");
  const filename = path.join(directory, mocks.asset.id);
  await mkdir(directory, { recursive: true });
  const raw = await sharp({ create: { width: 30, height: 50, channels: 3, background: "#987" } }).jpeg().withExif({ IFD0: { Artist: "Sensitive local EXIF" } }).toBuffer();
  await writeFile(filename, raw, { flag: "wx" });
  try {
    expect((await finishPhoto(mocks.asset.id)).ok).toBe(true);
    const stored = await readFile(filename);
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("private.finalize_photo"), [mocks.asset.id]);
    expect((await readdir(directory)).filter(name => name.startsWith(mocks.asset.id + ".clean-"))).toEqual([]);
  } finally { await unlink(filename); }
});
