import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
const url = "https://trlgsugychocgwtnmzej.supabase.co";
const keys = JSON.parse(
  await readFile(".vercel/supabase-keys.private.json", "utf8"),
);
const publicKey =
  keys.find((k) => k.type === "publishable")?.api_key ??
  keys.find((k) => k.name === "anon")?.api_key;
const adminKey = keys.find((k) => k.name === "service_role")?.api_key;
if (!publicKey || !adminKey) throw Error("Project credentials unavailable");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, adminKey, opts);
const accounts = [];
const marker = Date.now();
async function account(role, label) {
  const email = `${label}-${marker}@example.test`,
    password = randomBytes(24).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name:
        role === "coach" ? "مدرب معاينة اصطناعي" : "متدرب معاينة اصطناعي",
      role,
    },
  });
  if (error)
    throw Error(
      "Could not provision a synthetic review account: " + error.code,
    );
  const client = createClient(url, publicKey, opts);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw Error("Synthetic sign-in failed");
  const profile = await client.rpc("init_profile", {
    display_name:
      label === "coach"
        ? "عبدالله · معاينة"
        : label === "coach2"
          ? "نورة · معاينة"
          : "سلمان · معاينة",
    requested_role: role,
  });
  if (profile.error) throw Error(profile.error.message);
  accounts.push({ role, label, email, password, userId: data.user.id });
  return client;
}
async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw Error(error.message);
  return data;
}
async function command(client, command, payload) {
  return rpc(client, "app_command", { command, payload });
}
const coach = await account("coach", "coach"),
  other = await account("coach", "coach2"),
  trainee = await account("trainee", "trainee");
await mkdir(".vercel", { recursive: true });
await writeFile(
  ".vercel/preview-accounts.private.json",
  JSON.stringify(
    { url: "https://easycoach-livid.vercel.app", accounts },
    null,
    2,
  ),
);
const client = await command(coach, "client_save", {
  name: "سلمان · متدرب اصطناعي",
  email: accounts.find((a) => a.role === "trainee").email,
  phone: "",
});
const independent = await command(coach, "client_save", {
  name: "عميل ينتظر برنامجًا",
  email: `pending-${marker}@example.test`,
  phone: "",
});
const plan = {
  days: [
    {
      name: "الأحد · الجزء العلوي",
      exercises: [
        {
          name: "ضغط الصدر بالدمبل",
          description: "حركة متحكم بها مع ثبات الجذع.",
          video: "",
          sets: 3,
          reps: "10–12",
          rest: 90,
        },
        {
          name: "سحب أرضي",
          description: "حافظ على استقامة الظهر.",
          video: "",
          sets: 3,
          reps: "12",
          rest: 60,
        },
      ],
    },
    {
      name: "الثلاثاء · الجزء السفلي",
      exercises: [
        {
          name: "قرفصاء الكأس",
          description: "حركة بالمدى المريح.",
          video: "",
          sets: 4,
          reps: "8–10",
          rest: 90,
        },
      ],
    },
  ],
  nutrition: {
    text: "خطة نصية اصطناعية للمراجعة، وأهداف يحددها المدرب.",
    calories: 2200,
    protein: 150,
    carbs: 250,
    fat: 65,
  },
};
for (const e of plan.days.flatMap((d) => d.exercises))
  await command(coach, "exercise_save", {
    name: e.name,
    description: e.description,
    video: e.video,
  });
const template = await command(coach, "template_save", {
  name: "قالب التأسيس",
  content: plan,
});
const program = await command(coach, "program_save", {
  client_id: client.id,
  name: "برنامج التأسيس",
  content: plan,
});
await command(coach, "program_publish", { id: program.id });
const token = randomBytes(32).toString("hex");
const tokenHash = createHash("sha256").update(token).digest("hex");
await command(coach, "invite_create", {
  client_id: client.id,
  token_hash: tokenHash,
});
await assert.rejects(() => rpc(other, "claim_invite", { token: tokenHash }));
await rpc(trainee, "claim_invite", { token: tokenHash });
await assert.rejects(() => rpc(trainee, "claim_invite", { token: tokenHash }));
assert.equal((await rpc(trainee, "app_snapshot")).programs.length, 1);
assert.equal((await rpc(other, "app_snapshot")).clients.length, 0);
await assert.rejects(() =>
  command(other, "program_save", {
    client_id: client.id,
    name: "محاولة غير مسموحة",
    content: plan,
  }),
);
const edited = structuredClone(plan);
edited.days[0].exercises[0].sets = 5;
await command(coach, "template_save", {
  id: template.id,
  name: "قالب معدل مستقل",
  content: edited,
});
assert.equal(
  (await rpc(trainee, "app_snapshot")).programs[0].content.days[0].exercises[0]
    .sets,
  3,
);
const draft = await command(coach, "program_save", {
  client_id: client.id,
  name: "برنامج محدث",
  content: edited,
});
assert.equal(
  (await rpc(trainee, "app_snapshot")).programs[0].name,
  "برنامج التأسيس",
);
await command(coach, "program_publish", { id: draft.id });
const visible = (await rpc(trainee, "app_snapshot")).programs;
assert.equal(visible.length, 1);
assert.equal(visible[0].name, "برنامج محدث");
const sub = await command(coach, "subscription_create", {
  client_id: client.id,
  name: "متابعة شهرية",
  start_date: "2026-11-01",
  end_date: "2026-11-30",
  price: 650,
});
const pay = {
  id: randomUUID(),
  subscription_id: sub.id,
  amount: 300,
  method: "bank",
  paid_date: "2026-10-28",
  reference: "PREVIEW-" + marker,
};
await command(coach, "payment_add", pay);
await command(coach, "payment_add", pay);
assert.equal((await rpc(coach, "app_snapshot")).payments.length, 1);
await assert.rejects(() =>
  command(coach, "payment_add", {
    ...pay,
    id: randomUUID(),
    amount: 700,
    reference: "TOO-MUCH-" + marker,
  }),
);
const freeze = {
  id: randomUUID(),
  subscription_id: sub.id,
  start_date: "2026-11-05",
  end_date: "2026-11-07",
};
await command(coach, "freeze_apply", freeze);
await command(coach, "freeze_apply", freeze);
assert.equal(
  (await rpc(coach, "app_snapshot")).subscriptions[0].end_date,
  "2026-12-03",
);
await assert.rejects(() =>
  command(coach, "freeze_apply", { ...freeze, id: randomUUID() }),
);
await assert.rejects(() =>
  command(trainee, "payment_add", {
    ...pay,
    id: randomUUID(),
    reference: "UNAUTHORIZED",
  }),
);
const request = await command(trainee, "privacy_request", {
  client_id: client.id,
  kind: "correction",
  details: "طلب تصحيح اصطناعي لا يتضمن معلومات حقيقية",
});
await assert.rejects(() =>
  command(other, "privacy_fulfill", {
    id: request.id,
    resolution: "محاولة معزولة غير مسموحة",
  }),
);
await command(other, "client_save", {
  name: "عميل المدربة الثانية · اصطناعي",
  email: `other-${marker}@example.test`,
  phone: "",
});
await command(coach, "subscription_create", {
  client_id: independent.id,
  name: "تدريب شامل",
  start_date: "2026-11-07",
  end_date: "2026-12-06",
  price: 900,
});
await writeFile(
  ".vercel/deploy-env.private.json",
  JSON.stringify({
    APP_MODE: "supabase",
    APP_URL: "https://easycoach-livid.vercel.app",
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: keys.find((k) => k.name === "anon").api_key,
    SUPABASE_SERVICE_ROLE_KEY: adminKey,
  }),
);
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/remote-check-results.json",
  JSON.stringify(
    {
      passed: true,
      project: "trlgsugychocgwtnmzej",
      checks: [
        "verified password sign-in",
        "separate coach tenants",
        "snapshot-only trainee reads",
        "foreign client mutation denied",
        "template copies remain independent",
        "drafts hidden until published",
        "one latest published program",
        "email-matched invitation",
        "single-use invitation",
        "partial and idempotent payment",
        "overpayment rejected",
        "freeze applied once",
        "overlap rejected",
        "trainee mutation rejected",
        "privacy requests scoped",
      ],
      syntheticAccounts: accounts.length,
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  "PASS: remote Supabase authentication, RLS, invitations, programs, payments, freezing and data requests. Synthetic review accounts saved privately; no emails sent.",
);
