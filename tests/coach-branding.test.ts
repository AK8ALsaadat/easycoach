import { openLegacyDatabase as openDatabase } from "./helpers/legacy-db";
import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { rpcLocal, LOCAL_IDS } from "@/lib/local-db";
import { avatarUrl, brandingPreview, type CoachBranding } from "@/lib/coach-branding";
import { prepareCoachAvatar } from "@/lib/coach-avatar";
import type { PGlite } from "@electric-sql/pglite";
import path from "node:path";

let db: PGlite;
const { coach, other, trainee } = LOCAL_IDS;
let client: string;
let portrait: string;
const call = <T = unknown>(user: string | null, name: string, args = {}) => rpcLocal<T>(db, user, name, args);
const save = (user: string | null, name: string, avatar: string | null, version: string | null = null, change = true) =>
  call<CoachBranding>(user, "coach_branding_save", { display_name: name, change_avatar: change, avatar_data: avatar, expected_version: version });
const link = (token: string, kind: string) => call<CoachBranding | null>(null, "coach_branding_link", { token_hash: token, link_type: kind });

beforeAll(async () => {
  db = await openDatabase();
  for (const [uid, role] of [[coach, "coach"], [other, "coach"], [trainee, "trainee"]]) {
    await db.query("insert into auth.users values($1,$2,'synthetic',now())", [uid, `${uid}@example.test`]);
    await call(uid, "init_profile", { display_name: role === "coach" ? "المدرب الافتراضي" : "متدرب خاص", requested_role: role });
  }
  client = (await call<{ id: string }>(coach, "app_command", { command: "client_save", payload: { name: "اسم متدرب سري", email: "private@example.test", phone: "" } })).id;
  await db.query("update public.clients set trainee_user_id=$1 where id=$2", [trainee, client]);
  const bytes = await sharp({ create: { width: 640, height: 800, channels: 3, background: "#3260cc" } }).jpeg().withExif({ IFD0: { Artist: "Sensitive metadata" } }).toBuffer();
  portrait = await prepareCoachAvatar(new File([new Uint8Array(bytes)], "phone.jpg", { type: "image/jpeg" }));
});
afterAll(async () => { await db?.close(); });

it("provides defaults, isolates coaches, and preserves the account name", async () => {
  const initial = await call<CoachBranding[]>(coach, "coach_branding_snapshot");
  expect(initial).toHaveLength(1);
  expect(initial[0].name).toBe("المدرب الافتراضي");
  expect(avatarUrl(initial[0])).toBe("/coach-avatar.svg");
  const saved = await save(coach, "الكابتن أحمد", portrait);
  expect(saved.avatar_id).toBeTruthy();
  expect((await call<CoachBranding[]>(other, "coach_branding_snapshot"))[0].name).toBe("المدرب الافتراضي");
  expect((await db.query<{ name: string }>("select name from public.profiles where id=$1", [coach])).rows[0].name).toBe("المدرب الافتراضي");
  expect((await call<CoachBranding[]>(trainee, "coach_branding_snapshot"))[0].name).toBe("الكابتن أحمد");
});

it("rejects anonymous/trainee writes, direct table access, and stale overwrites", async () => {
  await expect(save(null, "غير مسموح", null)).rejects.toThrow();
  await expect(save(trainee, "غير مسموح", null)).rejects.toThrow();
  await expect(save(coach, "تعديل قديم", null)).rejects.toThrow("نافذة أخرى");
  await expect(db.transaction(async tx => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [other]);
    await tx.exec("select * from public.coach_branding");
  })).rejects.toThrow();
  const current = (await call<CoachBranding[]>(coach, "coach_branding_snapshot"))[0];
  await expect(save(coach, "س", null, current.updated_at)).rejects.toThrow();
  await expect(save(coach, "صورة غير صالحة", "<svg/>", current.updated_at)).rejects.toThrow();
});

it("applies identity to every valid link while revealing no trainee data or portal access", async () => {
  const portal = "a".repeat(64), invite = "b".repeat(64), join = "c".repeat(64);
  await call(coach, "app_command", { command: "portal_create", payload: { client_id: client, token_hash: portal, proof_hash: "d".repeat(64) } });
  await call(coach, "app_command", { command: "invite_create", payload: { client_id: client, token_hash: invite } });
  await call(coach, "app_command", { command: "join_link_create", payload: { token_hash: join } });
  for (const [token, kind] of [[portal, "p"], [invite, "invite"], [join, "join"]]) {
    const result = await link(token, kind);
    expect(result?.name).toBe("الكابتن أحمد");
    expect(Object.keys(result!)).toEqual(["name", "avatar_id"]);
    expect(JSON.stringify(brandingPreview(result, "https://example.test"))).not.toContain("private@example.test");
    expect(JSON.stringify(brandingPreview(result, "https://example.test"))).not.toContain(token);
  }
  const denied = await call<{ error?: string }>(null, "portal_access", { token_hash: portal, proof: "0".repeat(64) });
  expect(denied.error).toBeTruthy();
  expect(await link("e".repeat(64), "p")).toBeNull();
  expect(await link(portal, "invite")).toBeNull();
  await call(coach, "app_command", { command: "portal_revoke", payload: { client_id: client } });
  expect(await link(portal, "p")).toBeNull();
  await db.query("update public.invitations set consumed_at=now() where token_hash=$1", [invite]);
  expect(await link(invite, "invite")).toBeNull();
  await db.query("update public.join_links set expires_at=now()-interval '1 day' where token_hash=$1", [join]);
  expect(await link(join, "join")).toBeNull();
});

it("keeps photos on name-only edits and removes old revisions when replacing/resetting", async () => {
  const old = (await call<CoachBranding[]>(coach, "coach_branding_snapshot"))[0];
  const renamed = await save(coach, "اسم جديد", null, old.updated_at, false);
  expect(renamed.avatar_id).toBe(old.avatar_id);
  const replaced = await save(coach, "اسم جديد", portrait, renamed.updated_at);
  expect(replaced.avatar_id).not.toBe(old.avatar_id);
  expect(await call(null, "coach_branding_avatar", { asset: old.avatar_id })).toBeNull();
  expect(await call(null, "coach_branding_avatar", { asset: replaced.avatar_id })).toBe(portrait);
  expect(await call(null, "coach_branding_avatar", { asset: randomUUID() })).toBeNull();
  const reset = await save(coach, "", null, replaced.updated_at);
  expect(reset.name).toBe("المدرب الافتراضي");
  expect(reset.avatar_id).toBeNull();
  expect(await call(null, "coach_branding_avatar", { asset: replaced.avatar_id })).toBeNull();
});

it("actually decodes images, bounds output, strips EXIF and rejects disguised/oversize files", async () => {
  const meta = await sharp(Buffer.from(portrait, "base64")).metadata();
  expect([meta.width, meta.height, meta.format]).toEqual([512, 512, "jpeg"]);
  expect(meta.exif).toBeUndefined();
  expect(meta.icc).toBeUndefined();
  await expect(prepareCoachAvatar(new File(["<svg></svg>"], "fake.jpg", { type: "image/jpeg" }))).rejects.toThrow();
  await expect(prepareCoachAvatar(new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg"))).rejects.toThrow("5 ميجابايت");
});

it("persists the identity and portrait after closing and reopening the database", async () => {
  const location = path.resolve("artifacts", "branding-persistence-" + randomUUID());
  let stored = await openDatabase(location);
  let revision: string | null = null;
  try {
    await stored.query("insert into auth.users values($1,$2,'synthetic',now())", [coach, "persisted@example.test"]);
    await rpcLocal(stored, coach, "init_profile", { display_name: "مدرب محفوظ", requested_role: "coach" });
    const saved = await rpcLocal<CoachBranding>(stored, coach, "coach_branding_save", { display_name: "هوية محفوظة", change_avatar: true, avatar_data: portrait, expected_version: null });
    revision = saved.avatar_id;
  } finally { await stored.close(); }
  stored = await openDatabase(location);
  try {
    const result = await rpcLocal<CoachBranding[]>(stored, coach, "coach_branding_snapshot");
    expect(result[0].name).toBe("هوية محفوظة");
    expect(result[0].avatar_id).toBe(revision);
    expect(await rpcLocal(stored, null, "coach_branding_avatar", { asset: revision })).toBe(portrait);
  } finally { await stored.close(); }
});
