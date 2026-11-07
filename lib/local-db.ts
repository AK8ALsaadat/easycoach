import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { scryptSync, randomBytes, createHash } from "node:crypto";

export const LOCAL_IDS = {
  coach: "11111111-1111-4111-8111-111111111111",
  other: "22222222-2222-4222-8222-222222222222",
  trainee: "33333333-3333-4333-8333-333333333333",
};
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export async function openDatabase(location?: string) {
  if (location) await mkdir(location, { recursive: true });
  const db = new PGlite(location);
  await db.exec(`create schema if not exists auth; create schema if not exists private;
 do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
 create table if not exists auth.users(id uuid primary key,email text unique not null,encrypted_password text not null,email_confirmed_at timestamptz);
 create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
 create table if not exists private.local_sessions(token_hash text primary key,user_id uuid not null references auth.users(id),expires_at timestamptz not null);
 create table if not exists private.rate_limits(key text primary key,attempts integer not null,window_start timestamptz not null default now());`);
  const exists = await db.query<{ present: string | null }>(
    `select to_regclass('public.profiles')::text as present`,
  );
  await db.exec(
    "create table if not exists private.app_migrations(name text primary key,checksum text not null,applied_at timestamptz default now())",
  );
  const directory = path.join(process.cwd(), "supabase/migrations");
  for (const name of (await readdir(directory))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(path.join(directory, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = await db.query<{ checksum: string }>(
      "select checksum from private.app_migrations where name=$1",
      [name],
    );
    if (applied.rows.length) {
      if (applied.rows[0].checksum !== checksum)
        throw new Error(
          "Applied migration changed; create a new migration instead",
        );
      continue;
    }
    await db.transaction(async (tx) => {
      // Adopt the initial local preview schema, created before migration metadata existed.
      if (!(exists.rows[0].present && name === "202611070001_core.sql"))
        await tx.exec(sql);
      await tx.query(
        "insert into private.app_migrations(name,checksum) values($1,$2)",
        [name, checksum],
      );
    });
  }
  return db;
}
export async function rpcLocal<T>(
  db: PGlite,
  userId: string | null,
  name: string,
  args: Record<string, unknown> = {},
) {
  if (
    !/^[a-z_]+$/.test(name) ||
    Object.keys(args).some((k) => !/^[a-z_]+$/.test(k))
  )
    throw new Error("Invalid RPC");
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claim.sub',$1,true)`, [
      userId ?? "",
    ]);
    const entries = Object.entries(args);
    const sql = `select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(",")}) as result`;
    const values = entries.map(([, value]) =>
      typeof value === "object" ? JSON.stringify(value) : value,
    );
    const result = await tx.query<{ result: T }>(sql, values);
    return result.rows[0].result;
  });
}
export async function seedDatabase(db: PGlite) {
  const found = await db.query(`select id from public.profiles limit 1`);
  if (found.rows.length) return;
  for (const [id, email, name, role] of [
    [LOCAL_IDS.coach, "coach@example.test", "عبدالله السالم", "coach"],
    [LOCAL_IDS.other, "coach2@example.test", "نورة العتيبي", "coach"],
    [LOCAL_IDS.trainee, "trainee@example.test", "سلمان التجريبي", "trainee"],
  ]) {
    await db.query(
      "insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())",
      [id, email, passwordHash("CoachPreview!2026")],
    );
    await rpcLocal(db, id, "init_profile", {
      display_name: name,
      requested_role: role,
    });
  }
  const clients = [];
  for (const [i, name] of [
    "سلمان التجريبي",
    "فهد التجريبي",
    "ريم التجريبية",
    "خالد التجريبي",
    "سارة التجريبية",
    "عمر التجريبي",
  ].entries()) {
    const row = await rpcLocal<{ id: string }>(
      db,
      LOCAL_IDS.coach,
      "app_command",
      {
        command: "client_save",
        payload: {
          name,
          email: i === 0 ? "trainee@example.test" : `client${i}@example.test`,
          phone: `050000000${i}`,
        },
      },
    );
    clients.push(row.id);
  }
  await db.query("update public.clients set trainee_user_id=$1 where id=$2", [
    LOCAL_IDS.trainee,
    clients[0],
  ]);
  const plan = {
    days: [
      {
        name: "الأحد · الجزء العلوي",
        exercises: [
          {
            name: "ضغط الصدر بالدمبل",
            description: "حركة متحكم بها، مع ثبات الجذع.",
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
            description: "انزل بالمدى المريح للحركة.",
            video: "",
            sets: 4,
            reps: "8–10",
            rest: 90,
          },
        ],
      },
    ],
    nutrition: {
      text: "وزّع الوجبات على يومك، والتزم بالخطة التي اتفقت عليها مع مدربك.",
      calories: 2200,
      protein: 150,
      carbs: 250,
      fat: 65,
    },
  };
  for (const ex of plan.days.flatMap((d) => d.exercises))
    await rpcLocal(db, LOCAL_IDS.coach, "app_command", {
      command: "exercise_save",
      payload: { name: ex.name, description: ex.description, video: "" },
    });
  await rpcLocal(db, LOCAL_IDS.coach, "app_command", {
    command: "template_save",
    payload: { name: "التأسيس · ٣ أيام", content: plan },
  });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const shift = (n: number) => {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  for (let i = 0; i < clients.length; i++) {
    const sub = await rpcLocal<{ id: string }>(
      db,
      LOCAL_IDS.coach,
      "app_command",
      {
        command: "subscription_create",
        payload: {
          client_id: clients[i],
          name: i % 2 ? "متابعة شهرية" : "تدريب شامل",
          start_date: shift(-25 + i),
          end_date: shift(4 + i * 5),
          price: 650,
        },
      },
    );
    if (i % 3 !== 2)
      await rpcLocal(db, LOCAL_IDS.coach, "app_command", {
        command: "payment_add",
        payload: {
          id: crypto.randomUUID(),
          subscription_id: sub.id,
          amount: i === 0 ? 650 : 300,
          method: "bank",
          paid_date: shift(-26 + i),
          reference: `DEMO-${i}`,
        },
      });
    if (i < 3) {
      const program = await rpcLocal<{ id: string }>(
        db,
        LOCAL_IDS.coach,
        "app_command",
        {
          command: "program_save",
          payload: {
            client_id: clients[i],
            name: "برنامج التأسيس",
            content: plan,
          },
        },
      );
      await rpcLocal(db, LOCAL_IDS.coach, "app_command", {
        command: "program_publish",
        payload: { id: program.id },
      });
    }
  }
  await rpcLocal(db, LOCAL_IDS.other, "app_command", {
    command: "client_save",
    payload: {
      name: "عميل المدربة الثانية",
      email: "other@example.test",
      phone: "",
    },
  });
}

const globalDb = globalThis as typeof globalThis & {
  coachDatabase?: Promise<PGlite>;
};
export function getLocalDatabase() {
  return (globalDb.coachDatabase ??= (async () => {
    const db = await openDatabase(
      process.env.LOCAL_DB_PATH ?? path.join(process.cwd(), "data/easycoach"),
    );
    await seedDatabase(db);
    return db;
  })());
}
