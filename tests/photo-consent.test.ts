import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import {
  PHOTO_CONSENT_VERSION,
  canUploadPhotos,
  photoConsentPoints,
  rememberConsentDismissed,
  shouldPromptConsent,
  wasConsentDismissed,
  type PhotoConsentState,
} from "@/lib/photo-consent";
import { riyadhToday } from "@/lib/dates";
import { coach, other, fixtureDatabase } from "./helpers/db";

const hex = () => createHash("sha256").update(randomUUID()).digest("hex");
let f: Awaited<ReturnType<typeof fixtureDatabase>>;
const today = riyadhToday();
const reservation = (clientId: string) => ({
  id: randomUUID(),
  client_id: clientId,
  entry_date: today,
  angle: "front",
  consent_confirmed: true,
  filename: "front.webp",
  mime: "image/webp",
  size: 70,
});
async function linkedClient() {
  const id = await f.client();
  const trainee = await f.newTrainee();
  await f.linkTrainee(id, trainee);
  return { id, trainee };
}
const accept = (user: string, target: string, version = PHOTO_CONSENT_VERSION) =>
  f.call<PhotoConsentState>(user, "photo_consent", { command: "accept", target, notice_version: version });
const reserve = (user: string, clientId: string) => f.manage<{ id: string }>(user, "photo_reserve", reservation(clientId));

beforeAll(async () => {
  f = await fixtureDatabase();
});
afterAll(async () => f?.db.close());

it("the app's notice version matches the database", async () => {
  const { rows } = await f.db.query<{ version: number }>("select private.photo_consent_version() as version");
  expect(rows[0].version).toBe(PHOTO_CONSENT_VERSION);
});

describe("consent gate", () => {
  it("blocks every upload until the trainee consents, and the coach cannot consent for them", async () => {
    const { id, trainee } = await linkedClient();
    await expect(reserve(coach, id)).rejects.toThrow("موافقة المتدرب");
    await expect(reserve(trainee, id)).rejects.toThrow("موافقة المتدرب");
    await expect(accept(coach, id)).rejects.toThrow("للمتدرب نفسه");
    await expect(accept(other, id)).rejects.toThrow();
    const state = await accept(trainee, id);
    expect(state).toMatchObject({ status: "accepted", version: PHOTO_CONSENT_VERSION });
    await expect(reserve(trainee, id)).resolves.toMatchObject({ client_id: id });
    await expect(reserve(coach, id)).resolves.toMatchObject({ client_id: id });
    const audit = await f.db.query<{ detail: string }>("select detail from public.audit where entity_id=$1 and action='موافقة المتدرب على صور التقدم'", [id]);
    expect(audit.rows[0].detail).toContain(String(PHOTO_CONSENT_VERSION));
  });

  it("asks again when the notice version increases", async () => {
    const { id, trainee } = await linkedClient();
    await accept(trainee, id);
    await f.db.query("create or replace function private.photo_consent_version() returns integer language sql immutable set search_path='' as $$ select 2 $$");
    try {
      const [state] = (await f.call<PhotoConsentState[]>(trainee, "photo_consent_snapshot")).filter((s) => s.client_id === id);
      expect(state.status).toBe("outdated");
      await expect(reserve(trainee, id)).rejects.toThrow("موافقة المتدرب");
      await expect(accept(trainee, id, 1)).rejects.toThrow("تحدّث نص الإشعار");
      expect(await accept(trainee, id, 2)).toMatchObject({ status: "accepted", version: 2 });
      await expect(reserve(trainee, id)).resolves.toBeTruthy();
      const history = await f.db.query("select 1 from public.client_consents where client_id=$1", [id]);
      expect(history.rows).toHaveLength(2);
    } finally {
      await f.db.query("create or replace function private.photo_consent_version() returns integer language sql immutable set search_path='' as $$ select 1 $$");
    }
  });
});

describe("revoking", () => {
  it("can keep earlier photos while stopping new uploads", async () => {
    const { id, trainee } = await linkedClient();
    await accept(trainee, id);
    const photo = await reserve(trainee, id);
    const state = await f.call<PhotoConsentState>(trainee, "photo_consent", { command: "revoke", target: id, delete_photos: false });
    expect(state.status).toBe("revoked");
    const kept = await f.db.query("select 1 from public.progress_photos where id=$1", [photo.id]);
    expect(kept.rows).toHaveLength(1);
    await expect(reserve(coach, id)).rejects.toThrow("موافقة المتدرب");
    expect(shouldPromptConsent(state)).toBe(false);
  });

  it("can delete every earlier photo and queue the files for storage removal", async () => {
    const { id, trainee } = await linkedClient();
    await accept(trainee, id);
    const photos = [await reserve(trainee, id), await reserve(coach, id)];
    const state = await f.call<PhotoConsentState & { deleted_photo_ids: string[] }>(trainee, "photo_consent", { command: "revoke", target: id, delete_photos: true });
    expect(state.deleted_photo_ids.sort()).toEqual(photos.map((p) => p.id).sort());
    const left = await f.db.query("select 1 from public.progress_photos where client_id=$1", [id]);
    expect(left.rows).toHaveLength(0);
    const queued = await f.db.query("select 1 from private.progress_photo_deletions where id = any($1::uuid[])", [photos.map((p) => p.id)]);
    expect(queued.rows).toHaveLength(2);
    const audit = await f.db.query<{ detail: string }>("select detail from public.audit where entity_id=$1 and action='إيقاف المتدرب لصور التقدم'", [id]);
    expect(audit.rows[0].detail).toContain("حذف");
  });

  it("only the trainee can revoke", async () => {
    const { id, trainee } = await linkedClient();
    await accept(trainee, id);
    await expect(f.call(coach, "photo_consent", { command: "revoke", target: id })).rejects.toThrow();
  });
});

describe("personal link and access", () => {
  it("works through a personal link without an account", async () => {
    const id = await f.client();
    const token = hex(), proof = hex();
    await f.app(coach, "portal_create", { client_id: id, token_hash: token, proof_hash: proof });
    const before = await f.call<PhotoConsentState>(null, "portal_photo_consent", { token_hash: token, proof });
    expect(before.status).toBe("none");
    await expect(f.call(null, "portal_management", { token_hash: token, proof, command: "photo_reserve", payload: reservation(id) })).rejects.toThrow("موافقة المتدرب");
    const accepted = await f.call<PhotoConsentState>(null, "photo_consent", { command: "accept", target: id, notice_version: PHOTO_CONSENT_VERSION, portal_hash: token, proof });
    expect(accepted.status).toBe("accepted");
    await expect(f.call(null, "portal_management", { token_hash: token, proof, command: "photo_reserve", payload: reservation(id) })).resolves.toBeTruthy();
    const wrong = await f.call<{ error?: string }>(null, "photo_consent", { command: "accept", target: id, notice_version: 1, portal_hash: token, proof: hex() });
    expect(wrong.error).toBeTruthy();
  });

  it("photos are visible only to the trainee and their own coach", async () => {
    const { id, trainee } = await linkedClient();
    await accept(trainee, id);
    const photo = await reserve(trainee, id);
    const stranger = await f.newTrainee();
    expect(await f.call(trainee, "photo_access", { asset: photo.id })).toMatchObject({ id: photo.id });
    expect(await f.call(coach, "photo_access", { asset: photo.id })).toMatchObject({ id: photo.id });
    expect(await f.call(other, "photo_access", { asset: photo.id })).toBeNull();
    expect(await f.call(stranger, "photo_access", { asset: photo.id })).toBeNull();
    const otherView = await f.call<PhotoConsentState[]>(other, "photo_consent_snapshot");
    expect(otherView.some((s) => s.client_id === id)).toBe(false);
    const coachView = await f.call<PhotoConsentState[]>(coach, "photo_consent_snapshot");
    expect(coachView.find((s) => s.client_id === id)?.status).toBe("accepted");
  });
});

describe("client helpers", () => {
  it("decide prompting and uploads from the recorded state", () => {
    const base = { client_id: "c", current_version: 1, version: 1, accepted_at: null, revoked_at: null };
    expect(canUploadPhotos({ ...base, status: "accepted" })).toBe(true);
    expect(canUploadPhotos({ ...base, status: "outdated" })).toBe(false);
    expect(canUploadPhotos(undefined)).toBe(false);
    expect(shouldPromptConsent({ ...base, status: "none" })).toBe(true);
    expect(shouldPromptConsent({ ...base, status: "outdated" })).toBe(true);
    expect(shouldPromptConsent({ ...base, status: "accepted" })).toBe(false);
  });
  it("names the coach in the notice and never pre-checks anything", () => {
    expect(photoConsentPoints()[0]).toContain("{0}");
    expect(photoConsentPoints().join(" ")).toContain("GPS");
  });
  it("remembers 'not now' safely even when storage is blocked", () => {
    const store = new Map<string, string>();
    const original = globalThis.window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } } });
    rememberConsentDismissed("c1");
    expect(wasConsentDismissed("c1")).toBe(true);
    expect(wasConsentDismissed("c1", 2)).toBe(false);
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); } } } });
    expect(() => rememberConsentDismissed("c2")).not.toThrow();
    expect(wasConsentDismissed("c2")).toBe(false);
    Object.defineProperty(globalThis, "window", { configurable: true, value: original });
  });
});
