import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
  openDatabase,
  rpcLocal,
  LOCAL_IDS,
  passwordHash,
} from "@/lib/local-db";
import {
  blankContent as defaultContent,
  content,
  type PortalData,
  type Snapshot,
} from "@/lib/model";
import { publishable } from "./helpers/db";
const blankContent = publishable(defaultContent);
import { riyadhToday, addDays } from "@/lib/dates";
let db: PGlite;
const coach = LOCAL_IDS.coach,
  other = LOCAL_IDS.other,
  trainee = LOCAL_IDS.trainee;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const call = <T = Record<string, unknown>>(
  user: string | null,
  name: string,
  args: Record<string, unknown> = {},
) => rpcLocal<T>(db, user, name, args);
const command = <T = Record<string, unknown>>(
  user: string,
  command: string,
  payload: unknown,
) => call<T>(user, "app_command", { command, payload });
let cid: string;
const token = hash("test-portal"),
  proof = hash("secret-proof");
beforeAll(async () => {
  db = await openDatabase();
  for (const [id, role] of [
    [coach, "coach"],
    [other, "coach"],
    [trainee, "trainee"],
  ]) {
    await db.query(
      "insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())",
      [id, id + "@example.test", passwordHash("Test!2026")],
    );
    await call(id, "init_profile", {
      display_name: "حساب اصطناعي",
      requested_role: role,
    });
  }
  cid = (
    await command<{ id: string }>(coach, "client_save", {
      name: "عميل استوديو",
      email: "studio@example.test",
      phone: "",
    })
  ).id;
  await db.query("update public.clients set trainee_user_id=$1 where id=$2", [
    trainee,
    cid,
  ]);
  await command(coach, "portal_create", {
    client_id: cid,
    token_hash: token,
    proof_hash: proof,
  });
});
afterAll(async () => {
  await db?.close();
});
it("denies anonymous null proof and wrong PIN without exposing client data", async () => {
  for (const p of [null, hash("wrong")]) {
    const r = await call(null, "portal_access", {
      token_hash: token,
      proof: p,
    });
    expect(r.error).toBeTruthy();
    expect(r.name).toBeUndefined();
  }
  const r = await call<PortalData>(null, "portal_access", {
    token_hash: token,
    proof,
    day: null,
    value: null,
    remove: false,
  });
  expect(r.name).toBe("عميل استوديو");
  expect(r.program).toBeNull();
});
it("validates meal structure in TypeScript and PostgreSQL and keeps old plans compatible", async () => {
  const p = structuredClone(blankContent);
  p.nutrition.meals = [
    {
      name: "فطور",
      time: "8:00",
      foods: "شوفان وحليب",
      calories: 450,
      protein: 30,
      carbs: 50,
      fat: 14,
    },
  ];
  expect(content.safeParse(p).success).toBe(true);
  await command(coach, "program_save", {
    client_id: cid,
    name: "خطة وجبات",
    content: p,
  });
  await expect(
    command(coach, "program_save", {
      client_id: cid,
      name: "خطة غير صالحة",
      content: {
        ...p,
        nutrition: {
          ...p.nutrition,
          meals: [{ ...p.nutrition.meals[0], calories: -1 }],
        },
      },
    }),
  ).rejects.toThrow();
});
it("portal returns the latest published version, never drafts or coach notes", async () => {
  await command(coach, "goal_save", {
    client_id: cid,
    goal: "بناء عضل",
    target_weight: 80,
    focus: "4 أيام",
    notes: "ملاحظة داخلية",
  });
  let s = await call<Snapshot>(coach, "studio_snapshot");
  const draft = s.programs.find((p) => p.client_id === cid && !p.published_at)!;
  let portal = await call<PortalData>(null, "portal_access", {
    token_hash: token,
    proof,
  });
  expect(portal.program).toBeNull();
  await command(coach, "program_publish", { id: draft.id });
  portal = await call<PortalData>(null, "portal_access", {
    token_hash: token,
    proof,
  });
  expect(portal.program?.name).toBe("خطة وجبات");
  expect(portal.program?.content.nutrition.meals?.[0].name).toBe("فطور");
  expect(portal.goal).not.toHaveProperty("notes");
  const p = structuredClone(blankContent);
  await command(coach, "program_save", {
    client_id: cid,
    name: "تحديث قادم",
    content: p,
  });
  portal = await call<PortalData>(null, "portal_access", {
    token_hash: token,
    proof,
  });
  expect(portal.program?.name).toBe("خطة وجبات");
  s = await call(coach, "studio_snapshot");
  expect(JSON.stringify(s.portal_links)).not.toContain(proof);
});
it("upserts one weight per Riyadh date, rejects future dates and permits linked trainee corrections", async () => {
  const today = riyadhToday();
  await call(null, "portal_access", {
    token_hash: token,
    proof,
    day: today,
    value: 82.4,
  });
  await call(null, "portal_access", {
    token_hash: token,
    proof,
    day: today,
    value: 82.1,
  });
  let s = await call<Snapshot>(coach, "studio_snapshot");
  expect(s.weights.filter((w) => w.client_id === cid)).toHaveLength(1);
  expect(Number(s.weights[0].weight)).toBe(82.1);
  const result = await call(null, "portal_access", {
    token_hash: token,
    proof,
    day: addDays(today, 1),
    value: 82,
  });
  expect(result.error).toBeTruthy();
  await command(trainee, "weight_save", {
    client_id: cid,
    entry_date: today,
    weight: 81.9,
  });
  s = await call<Snapshot>(trainee, "studio_snapshot");
  expect(Number(s.weights[0].weight)).toBe(81.9);
  expect(s.client_goals[0]).not.toHaveProperty("notes");
  await expect(
    db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        trainee,
      ]);
      return tx.query("select notes from public.client_goals");
    }),
  ).rejects.toThrow();
  await expect(
    command(other, "weight_save", {
      client_id: cid,
      entry_date: today,
      weight: 70,
    }),
  ).rejects.toThrow();
  const foreign = await call<Snapshot>(other, "studio_snapshot");
  expect(foreign.weights).toHaveLength(0);
  expect(foreign.client_goals).toHaveLength(0);
  expect(foreign.portal_links).toHaveLength(0);
});
it("rejects foreign coach videos and does not expose drafts through media RPC", async () => {
  const mediaId = randomUUID();
  await command(coach, "media_reserve", {
    id: mediaId,
    filename: "squat.mp4",
    size: 64,
    mime: "video/mp4",
  });
  await command(coach, "media_ready", { id: mediaId });
  const p = structuredClone(blankContent);
  p.days[0].exercises[0].mediaId = mediaId;
  await command(coach, "program_save", {
    client_id: cid,
    name: "فيديو مسودة",
    content: p,
  });
  await expect(
    call(null, "media_access", { asset: mediaId, portal_hash: token, proof }),
  ).rejects.toThrow();
  await expect(
    call(other, "media_access", { asset: mediaId }),
  ).rejects.toThrow();
  const foreignClient = (
    await command<{ id: string }>(other, "client_save", {
      name: "عميل آخر",
      email: "other@example.test",
      phone: "",
    })
  ).id;
  await expect(
    command(other, "program_save", {
      client_id: foreignClient,
      name: "فيديو غير مصرح",
      content: p,
    }),
  ).rejects.toThrow();
  const s = await call<Snapshot>(coach, "studio_snapshot");
  await command(coach, "program_publish", {
    id: s.programs.find((p) => p.client_id === cid && !p.published_at)!.id,
  });
  const r = await call(null, "media_access", {
    asset: mediaId,
    portal_hash: token,
    proof,
  });
  expect(r.id).toBe(mediaId);
});
it("caps video metadata, makes QR reservation single-file and enforces expiry", async () => {
  const qr = hash("qr");
  await command(coach, "upload_session", { token_hash: qr });
  const a = await call<{ asset: { id: string } }>(null, "upload_access", {
    token_hash: qr,
    payload: { filename: "phone.mp4", size: 80, mime: "video/mp4" },
  });
  const b = await call<{ asset: { id: string } }>(null, "upload_access", {
    token_hash: qr,
    payload: { filename: "different.mp4", size: 80, mime: "video/mp4" },
  });
  expect(a.asset.id).toBe(b.asset.id);
  await db.query(
    "update public.upload_sessions set expires_at=now()-interval '1 minute' where token_hash=$1",
    [qr],
  );
  await expect(
    call(null, "upload_access", { token_hash: qr }),
  ).rejects.toThrow();
  await expect(
    command(coach, "media_reserve", {
      id: randomUUID(),
      filename: "bad.exe",
      size: 100,
      mime: "application/octet-stream",
    }),
  ).rejects.toThrow();
});
it("revocation invalidates both portal reads and media access immediately", async () => {
  await command(coach, "portal_revoke", { client_id: cid });
  const r = await call(null, "portal_access", { token_hash: token, proof });
  expect(r.error).toBeTruthy();
  expect(
    await call(null, "media_access", {
      asset: (await call<Snapshot>(coach, "studio_snapshot")).media_assets[0]
        .id,
      portal_hash: token,
      proof,
    }),
  ).toBeNull();
});
it("changing a client email revokes links while archiving preserves weights and goals", async () => {
  const t = hash("second");
  await command(coach, "portal_create", {
    client_id: cid,
    token_hash: t,
    proof_hash: proof,
  });
  await command(coach, "client_save", {
    id: cid,
    name: "عميل استوديو",
    email: "changed@example.test",
    phone: "",
  });
  expect(
    (await call(null, "portal_access", { token_hash: t, proof })).error,
  ).toBeTruthy();
  await db.query("update public.clients set archived=true where id=$1", [cid]);
  const s = await call<Snapshot>(coach, "studio_snapshot");
  expect(s.weights.filter((w) => w.client_id === cid)).toHaveLength(1);
  expect(s.client_goals.filter((g) => g.client_id === cid)).toHaveLength(1);
});
