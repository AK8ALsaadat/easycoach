import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const env = JSON.parse(
  await readFile(".vercel/deploy-env.private.json", "utf8"),
);
const accounts = JSON.parse(
  await readFile(".vercel/preview-accounts.private.json", "utf8"),
).accounts;
const make = () =>
  createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const coach = make(),
  other = make(),
  anon = make();
for (const [client, account] of [
  [coach, accounts[0]],
  [other, accounts[1]],
]) {
  const r = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  assert.ifError(r.error);
}
const rpc = async (client, name, args = {}) => {
  const r = await client.rpc(name, args);
  if (r.error) throw Error(r.error.message);
  return r.data;
};
const command = (c, command, payload) =>
  rpc(c, "app_command", { command, payload });
const hash = (s) => createHash("sha256").update(s).digest("hex");
const cid = (
  await command(coach, "client_save", {
    name: "عميل استوديو اصطناعي",
    email: "studio-" + Date.now() + "@example.test",
    phone: "",
  })
).id;
const token = randomBytes(32).toString("hex"),
  proof = hash(token + ":123456");
await command(coach, "portal_create", {
  client_id: cid,
  token_hash: hash(token),
  proof_hash: proof,
});
assert(
  (await rpc(anon, "portal_access", { token_hash: hash(token), proof: null }))
    .error,
);
assert.equal(
  (await rpc(anon, "portal_access", { token_hash: hash(token), proof })).name,
  "عميل استوديو اصطناعي",
);
await command(coach, "goal_save", {
  client_id: cid,
  goal: "بناء عضل",
  target_weight: 85,
  focus: "أربعة أيام",
  notes: "ملاحظة داخلية اصطناعية",
});
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Riyadh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
await rpc(anon, "portal_access", {
  token_hash: hash(token),
  proof,
  day: today,
  value: 82.4,
});
await rpc(anon, "portal_access", {
  token_hash: hash(token),
  proof,
  day: today,
  value: 82.1,
});
assert.equal(
  (await rpc(coach, "studio_snapshot")).weights.filter(
    (w) => w.client_id === cid,
  ).length,
  1,
);
assert.equal(
  (await rpc(other, "studio_snapshot")).weights.filter(
    (w) => w.client_id === cid,
  ).length,
  0,
);
const file = await readFile("artifacts/studio/exercise.webm");
const asset = await command(coach, "media_reserve", {
  id: randomUUID(),
  filename: "synthetic-movement.webm",
  size: file.length,
  mime: "video/webm",
});
const signed = await coach.storage
  .from("coach-videos")
  .createSignedUploadUrl(asset.path);
assert.ifError(signed.error);
const upload = await fetch(signed.data.signedUrl, {
  method: "PUT",
  headers: { "Content-Type": "video/webm" },
  body: file,
});
assert.equal(upload.status, 200);
assert.equal(
  (await coach.storage.from("coach-videos").info(asset.path)).data.size,
  file.length,
);
await command(coach, "media_ready", { id: asset.id });
const foreign = await other.storage
  .from("coach-videos")
  .createSignedUrl(asset.path, 60);
assert(foreign.error, "Another coach must not sign private videos");
const unauth = await anon.storage.from("coach-videos").getPublicUrl(asset.path);
const publicRead = await fetch(unauth.data.publicUrl);
assert.notEqual(publicRead.status, 200);
const plan = {
  days: [
    {
      name: "قوة",
      exercises: [
        {
          name: "سكوات",
          description: "مثال اصطناعي",
          video: "",
          sets: 4,
          reps: "8–10",
          rest: 90,
          catalogId: "Barbell_Squat",
          mediaId: asset.id,
          rowId: randomUUID(),
        },
      ],
    },
  ],
  nutrition: {
    text: "خطة اصطناعية",
    calories: 2400,
    protein: 160,
    carbs: 260,
    fat: 80,
    meals: [
      {
        name: "فطور",
        time: "صباحًا",
        foods: "شوفان وحليب",
        calories: 500,
        protein: 30,
        carbs: 60,
        fat: 16,
      },
    ],
  },
};
const draft = await command(coach, "program_save", {
  client_id: cid,
  name: "قوة مع وجبات",
  content: plan,
});
assert.equal(
  (await rpc(anon, "portal_access", { token_hash: hash(token), proof }))
    .program,
  null,
);
await command(coach, "program_publish", { id: draft.id });
const portal = await rpc(anon, "portal_access", {
  token_hash: hash(token),
  proof,
});
assert.equal(portal.program.content.nutrition.meals.length, 1);
assert(!Object.hasOwn(portal.goal, "notes"));
assert.equal(
  (
    await rpc(anon, "media_access", {
      asset: asset.id,
      portal_hash: hash(token),
      proof,
    })
  ).id,
  asset.id,
);
const qr = randomBytes(32).toString("hex");
await command(coach, "upload_session", { token_hash: hash(qr) });
const phone = await rpc(anon, "upload_access", {
  token_hash: hash(qr),
  payload: { filename: "phone.webm", size: file.length, mime: "video/webm" },
});
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const phoneSigned = await admin.storage
  .from("coach-videos")
  .createSignedUploadUrl(phone.asset.path);
assert.ifError(phoneSigned.error);
assert.equal(
  (
    await fetch(phoneSigned.data.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/webm" },
      body: file,
    })
  ).status,
  200,
);
assert.equal(
  (
    await rpc(anon, "upload_access", {
      token_hash: hash(qr),
      payload: { complete: true },
    })
  ).asset.status,
  "ready",
);
await command(coach, "portal_revoke", { client_id: cid });
assert(
  (await rpc(anon, "portal_access", { token_hash: hash(token), proof })).error,
);
await writeFile(
  "artifacts/studio/remote-results.json",
  JSON.stringify(
    {
      passed: true,
      project: "trlgsugychocgwtnmzej",
      checks: [
        "hosted snapshot RLS",
        "PIN required including NULL proof",
        "daily weight correction and coach isolation",
        "private Storage upload and foreign signing denied",
        "meal plan publishing",
        "draft hidden",
        "portal media scoping",
        "anonymous QR upload and actual object validation",
        "portal revocation",
      ],
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  "PASS: real Supabase studio, RLS, private video storage, QR capability, PIN, meals and weights. No messages sent.",
);
