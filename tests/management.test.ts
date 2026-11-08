import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import ExcelJS from "exceljs";
import {
  openDatabase,
  rpcLocal,
  LOCAL_IDS,
  passwordHash,
} from "@/lib/local-db";
import { blankContent, content, type Snapshot } from "@/lib/model";
import {
  recordInput,
  effectiveNutrition,
  type ManagementData,
} from "@/lib/management";
import { readImportFile } from "@/lib/import";
import {
  autoMapping,
  parseImportDate,
  previewFullImport,
  workbookSheets,
} from "@/lib/full-import";
import { prepareImport } from "@/lib/import-batch";
import { exportWorkbook } from "@/lib/export-workbook";
import { coachingAlerts } from "@/lib/coaching-alerts";
import { riyadhToday } from "@/lib/dates";

let db: PGlite;
const coach = LOCAL_IDS.coach,
  other = LOCAL_IDS.other,
  trainee = LOCAL_IDS.trainee;
const ids: string[] = [];
const today = riyadhToday();
const call = <T = Record<string, unknown>>(
  user: string | null,
  name: string,
  args: Record<string, unknown> = {},
) => rpcLocal<T>(db, user, name, args);
const old = <T = Record<string, unknown>>(
  user: string,
  command: string,
  payload: unknown,
) => call<T>(user, "app_command", { command, payload });
const command = <T = Record<string, unknown>>(
  user: string,
  command: string,
  payload: unknown,
) => call<T>(user, "management_command", { command, payload });
const snapshot = (user = coach) => call<Snapshot>(user, "management_snapshot");
const record = (
  client_id: string,
  kind: string,
  payload: unknown,
  entry_date = today,
) => ({ id: randomUUID(), client_id, kind, payload, entry_date });
const macros = { calories: 2100, protein: 150, carbs: 220, fat: 65 };
const checkin = {
  sleep: 3,
  energy: 4,
  hunger: 3,
  stress: 2,
  training_adherence: 70,
  nutrition_adherence: 80,
  feedback: "أسبوع اختباري",
  questions: "سؤال",
  photo_ids: [],
};
beforeAll(async () => {
  db = await openDatabase();
  for (const [id, role] of [
    [coach, "coach"],
    [other, "coach"],
    [trainee, "trainee"],
  ]) {
    await db.query(
      "insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,$3,now())",
      [id, id + "@example.test", passwordHash("FictionalTest!2026")],
    );
    await call(id, "init_profile", {
      display_name: "Fictional test account",
      requested_role: role,
    });
  }
  for (let i = 0; i < 50; i++) {
    const created = await old<{ id: string }>(coach, "client_save", {
      name: `Fictional client ${i + 1}`,
      email: `fixture-${i + 1}@example.test`,
      phone: "",
    });
    ids.push(created.id);
  }
  await db.query("update public.clients set trainee_user_id=$1 where id=$2", [
    trainee,
    ids[0],
  ]);
});
afterAll(async () => {
  await db?.close();
});

it("persists 50 fictional clients and isolates both the snapshot and direct table access", async () => {
  expect((await snapshot()).clients).toHaveLength(50);
  expect((await snapshot(other)).clients).toHaveLength(0);
  await expect(
    command(other, "details_save", {
      client_id: ids[0],
      details: { height: 180 },
    }),
  ).rejects.toThrow();
});
it("saves typed personal details without changing identity or authentication linkage", async () => {
  await command(coach, "details_save", {
    client_id: ids[0],
    details: {
      birth_date: "1997-01-12",
      height: 180,
      gender: "male",
      start_date: "2026-01-01",
      status: "new",
    },
  });
  const data = await snapshot();
  expect(
    data.management!.details.find((detail) => detail.client_id === ids[0]),
  ).toMatchObject({ height: 180, birth_date: "1997-01-12", status: "new" });
  expect(
    data.clients.find((client) => client.id === ids[0])!.trainee_user_id,
  ).toBe(trainee);
  await expect(
    command(coach, "details_save", {
      client_id: ids[0],
      details: { height: 900 },
    }),
  ).rejects.toThrow();
});
it("allows the linked client to add historical measurements, preserves multiple versions, and blocks other clients", async () => {
  const first = record(
    ids[0],
    "measurement",
    { weight: 90, waist: 100, body_fat: 25, custom: { neck: 38 }, notes: "" },
    "2026-01-01",
  );
  await command(trainee, "record_save", first);
  await command(trainee, "record_save", first);
  await command(
    coach,
    "record_save",
    record(
      ids[0],
      "measurement",
      { weight: 87, waist: 95, notes: "" },
      "2026-02-01",
    ),
  );
  await command(
    coach,
    "record_save",
    record(
      ids[0],
      "measurement",
      { weight: 85, waist: 92, notes: "" },
      "2026-03-01",
    ),
  );
  const records = (await snapshot()).management!.records.filter(
    (row) => row.client_id === ids[0] && row.kind === "measurement",
  );
  expect(records).toHaveLength(3);
  expect(records.map((row) => row.entry_date).sort()).toEqual([
    "2026-01-01",
    "2026-02-01",
    "2026-03-01",
  ]);
  expect(
    (await snapshot()).weights
      .filter((weight) => weight.client_id === ids[0])
      .map((weight) => Number(weight.weight)),
  ).toEqual([90, 87, 85]);
  await expect(
    command(
      trainee,
      "record_save",
      record(ids[1], "measurement", { weight: 80, notes: "" }),
    ),
  ).rejects.toThrow();
});
it("keeps corrected legacy daily weights in an immutable audit history", async () => {
  await old(coach, "weight_save", {
    client_id: ids[0],
    entry_date: today,
    weight: 84,
  });
  await old(coach, "weight_save", {
    client_id: ids[0],
    entry_date: today,
    weight: 83.5,
  });
  const records = (await snapshot()).management!.records.filter(
    (row) => row.client_id === ids[0] && row.kind === "measurement",
  );
  expect(
    records.some(
      (row) =>
        row.payload.weight === 84 && row.payload.historical_only === true,
    ),
  ).toBe(true);
  await expect(
    db.query("update public.coaching_records set payload=$1 where id=$2", [
      JSON.stringify({ weight: 1 }),
      records[0].id,
    ]),
  ).rejects.toThrow();
});
it("keeps coach notes private in snapshots, client table queries, and Excel exports", async () => {
  const note = record(ids[0], "note", { text: "PRIVATE_ONLY_COACH" });
  await command(coach, "record_save", note);
  expect(
    (await snapshot(trainee)).management!.records.some(
      (row) => row.kind === "note",
    ),
  ).toBe(false);
  await expect(
    db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        trainee,
      ]);
      expect(
        (
          await tx.query(
            "select * from public.coaching_records where kind='note'",
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        tx.query(
          "insert into public.coaching_records(id,client_id,coach_id,kind,entry_date,payload,author_id,source_key) values(gen_random_uuid(),$1,$2,'note',current_date,'{\"text\":\"bad\"}',$3,'bad')",
          [ids[0], coach, trainee],
        ),
      ).rejects.toThrow();
    }),
  ).rejects.toThrow();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    (await exportWorkbook(await snapshot(trainee))) as never,
  );
  expect(book.getWorksheet("Notes")!.actualRowCount).toBe(1);
});
it("submits/reviews check-ins with visible feedback and rejects trainee review forgery", async () => {
  const row = record(ids[0], "checkin", checkin);
  await command(trainee, "record_save", row);
  await expect(
    command(trainee, "record_review", {
      id: row.id,
      feedback: "forged",
      reviewed: true,
    }),
  ).rejects.toThrow();
  await command(coach, "record_review", {
    id: row.id,
    feedback: "خطة الأسبوع واضحة",
    reviewed: true,
  });
  expect(
    (await snapshot(trainee)).management!.records.find(
      (record) => record.id === row.id,
    ),
  ).toMatchObject({ coach_feedback: "خطة الأسبوع واضحة" });
});
it("keeps dated actual macros and target changes independently", async () => {
  await command(
    coach,
    "record_save",
    record(
      ids[0],
      "nutrition_target",
      { ...macros, text: "خطة أولى" },
      "2026-01-01",
    ),
  );
  await command(
    coach,
    "record_save",
    record(
      ids[0],
      "nutrition_target",
      { ...macros, calories: 2200, text: "خطة ثانية" },
      "2026-02-01",
    ),
  );
  await command(
    trainee,
    "record_save",
    record(
      ids[0],
      "nutrition_log",
      { ...macros, calories: 2050, notes: "" },
      "2026-02-02",
    ),
  );
  expect(
    (await snapshot()).management!.records.filter(
      (row) => row.kind === "nutrition_target",
    ),
  ).toHaveLength(2);
  await expect(
    command(trainee, "record_save", record(ids[0], "nutrition_target", macros)),
  ).rejects.toThrow();
});
it("stores completed workout loads and effort and validates prescription fields", async () => {
  const plan = structuredClone(blankContent);
  plan.days[0].weekday = 0;
  Object.assign(plan.days[0].exercises[0], {
    weight: 40,
    rpe: 8,
    rir: 2,
    tempo: "3-1-1-0",
  });
  expect(content.safeParse(plan).success).toBe(true);
  await old(coach, "template_save", { name: "Effort template", content: plan });
  await command(
    trainee,
    "record_save",
    record(ids[0], "workout_log", {
      day_name: "Upper",
      completed: true,
      notes: "",
      exercises: [
        {
          name: "Bench press",
          sets: 3,
          reps: "10",
          weight: 40,
          rpe: 8,
          rir: 2,
        },
      ],
    }),
  );
  expect(
    (await snapshot()).management!.records.some(
      (record) => record.kind === "workout_log",
    ),
  ).toBe(true);
  expect(
    recordInput.safeParse(
      record(ids[0], "workout_log", {
        day_name: "Upper",
        completed: true,
        exercises: [{ name: "Bench press", sets: 3, reps: "10", weight: -10 }],
      }),
    ).success,
  ).toBe(false);
});
it("copies one template to five clients atomically and preserves independent programs after edit/delete", async () => {
  const template = await old<{ id: string }>(coach, "template_save", {
    name: "Five-client template",
    content: blankContent,
  });
  await command(coach, "template_meta", {
    id: template.id,
    description: "Reusable split",
    archived: false,
    kind: "workout",
  });
  await command(coach, "template_assign", {
    id: template.id,
    clients: ids.slice(10, 15),
    replace_drafts: false,
    publish: true,
  });
  let data = await snapshot();
  const assigned = data.programs.filter((program) =>
    ids.slice(10, 15).includes(program.client_id),
  );
  expect(assigned).toHaveLength(5);
  const changed = structuredClone(blankContent);
  changed.days[0].exercises[0].sets = 5;
  await old(coach, "template_save", {
    id: template.id,
    name: "Changed template",
    content: changed,
  });
  await command(coach, "template_delete", { id: template.id });
  data = await snapshot();
  expect(
    data.programs
      .filter((program) => ids.slice(10, 15).includes(program.client_id))
      .every((program) => program.content.days[0].exercises[0].sets === 3),
  ).toBe(true);
  await old(coach, "program_save", {
    client_id: ids[10],
    name: "Only one",
    content: changed,
  });
  expect(
    (await snapshot()).programs
      .filter((program) => program.client_id === ids[11])
      .every((program) => program.content.days[0].exercises[0].sets === 3),
  ).toBe(true);
});
it("duplicates full template metadata, archives safely, and blocks silent draft replacement", async () => {
  const template = await old<{ id: string }>(coach, "template_save", {
    name: "Nutrition copy",
    content: blankContent,
  });
  await command(coach, "template_meta", {
    id: template.id,
    description: "Copy this",
    archived: false,
    kind: "nutrition",
  });
  const duplicate = await command<{ id: string }>(coach, "template_duplicate", {
    id: template.id,
  });
  expect(
    (await snapshot()).management!.template_metadata.find(
      (meta) => meta.template_id === duplicate.id,
    ),
  ).toMatchObject({ description: "Copy this", kind: "nutrition" });
  await command(coach, "template_meta", {
    id: template.id,
    description: "Copy this",
    archived: true,
    kind: "nutrition",
  });
  await expect(
    command(coach, "template_assign", { id: template.id, clients: [ids[20]] }),
  ).rejects.toThrow();
  await old(coach, "program_save", {
    client_id: ids[20],
    name: "Existing draft",
    content: blankContent,
  });
  await expect(
    command(coach, "template_assign", {
      id: duplicate.id,
      clients: [ids[21], ids[20]],
      replace_drafts: false,
    }),
  ).rejects.toThrow();
  expect(
    (await snapshot()).programs.some(
      (program) => program.client_id === ids[21],
    ),
  ).toBe(false);
});
it("nutrition-only assignment keeps the client's training days", async () => {
  const base = structuredClone(blankContent);
  base.days[0].name = "Keep my training";
  await old(coach, "program_save", {
    client_id: ids[22],
    name: "Existing",
    content: base,
  });
  const nutrition = structuredClone(blankContent);
  nutrition.nutrition = { ...nutrition.nutrition, ...macros };
  const t = await old<{ id: string }>(coach, "template_save", {
    name: "Nutrition only",
    content: nutrition,
  });
  await command(coach, "template_meta", {
    id: t.id,
    kind: "nutrition",
    archived: false,
    description: "",
  });
  await command(coach, "template_assign", {
    id: t.id,
    clients: [ids[22]],
    replace_drafts: true,
  });
  const program = (await snapshot()).programs.find(
    (program) => program.client_id === ids[22],
  )!;
  expect(program.content.days[0].name).toBe("Keep my training");
  expect(program.content.nutrition.calories).toBe(2100);
  expect(program.name).toBe("Existing");
  await expect(
    command(coach, "template_assign", {
      id: t.id,
      clients: [ids[23]],
      replace_drafts: false,
      publish: true,
    }),
  ).rejects.toThrow();
  expect((await snapshot()).programs.some((p) => p.client_id === ids[23])).toBe(
    false,
  );
});
it("keeps trainer/client message authors and read state persistent", async () => {
  const a = record(ids[0], "message", { text: "رسالة من المتدرب" }),
    b = record(ids[0], "message", { text: "رد المدرب" });
  await command(trainee, "record_save", a);
  await command(coach, "record_save", b);
  await command(coach, "messages_read", { client_id: ids[0] });
  const records = (await snapshot()).management!.records;
  expect(records.find((record) => record.id === a.id)).toMatchObject({
    author_type: "client",
  });
  expect(records.find((record) => record.id === a.id)!.read_at).not.toBeNull();
  expect(records.find((record) => record.id === b.id)!.read_at).toBeNull();
});
it("supports PIN-based check-ins without exposing notes or another client's records", async () => {
  const token = createHash("sha256").update("test token").digest("hex"),
    proof = createHash("sha256").update("test proof").digest("hex");
  await old(coach, "portal_create", {
    client_id: ids[0],
    token_hash: token,
    proof_hash: proof,
  });
  const row = record(ids[0], "checkin", checkin);
  const denied = await call<{ error: string }>(null, "portal_management", {
    token_hash: token,
    proof: null,
    command: "snapshot",
    payload: {},
  });
  expect(denied.error).toBeTruthy();
  const data = await call<{ management: ManagementData }>(
    null,
    "portal_management",
    { token_hash: token, proof, command: "record_save", payload: row },
  );
  expect(
    data.management.records.some(
      (record) => record.id === row.id && record.author_type === "client",
    ),
  ).toBe(true);
  expect(data.management.records.some((record) => record.kind === "note")).toBe(
    false,
  );
  await expect(
    call(null, "portal_management", {
      token_hash: token,
      proof,
      command: "record_save",
      payload: record(ids[1], "message", { text: "forged" }),
    }),
  ).rejects.toThrow();
});

async function fixtureWorkbook() {
  const book = new ExcelJS.Workbook();
  const client = book.addWorksheet("العملاء");
  client.addRow([
    "الاسم الكامل",
    "البريد الإلكتروني",
    "الجوال",
    "الطول",
    "تاريخ الميلاد",
    "الجنس",
    "تاريخ البداية",
    "حالة العميل",
  ]);
  client.addRow([
    "عميل استيراد كامل",
    "migration@example.test",
    "0501234567",
    180,
    "1995-04-20",
    "ذكر",
    "2026-01-01",
    "نشط",
  ]);
  const weights = book.addWorksheet("الأوزان");
  weights.addRow(["email", "date", "weight"]);
  for (const row of [
    ["01/01/2026", 90],
    ["01/02/2026", 87],
    ["01/03/2026", 85],
  ])
    weights.addRow(["migration@example.test", ...row]);
  const measurement = book.addWorksheet("Measurements");
  measurement.addRow([
    "email",
    "date",
    "body_fat",
    "waist",
    "chest",
    "arm",
    "thigh",
    "custom:neck",
  ]);
  measurement.addRow([
    "migration@example.test",
    "2026-03-01",
    20,
    90,
    100,
    35,
    58,
    38,
  ]);
  for (const [name, day] of [
    ["NutritionTargets", "2026-02-01"],
    ["NutritionLogs", "2026-02-02"],
  ]) {
    const tab = book.addWorksheet(name);
    tab.addRow(["email", "date", "calories", "protein", "carbs", "fat"]);
    tab.addRow(["migration@example.test", day, 2100, 150, 220, 65]);
  }
  const program = book.addWorksheet("Programs");
  program.addRow([
    "email",
    "date",
    "program_ref",
    "program_name",
    "day_name",
    "exercise_name",
    "sets",
    "reps",
    "rest",
    "weight",
    "rpe",
    "rir",
    "tempo",
  ]);
  program.addRow([
    "migration@example.test",
    "2026-02-01",
    "legacy-plan",
    "Imported plan",
    "Upper",
    "Bench press",
    3,
    "8–12",
    90,
    50,
    8,
    2,
    "3-1-1-0",
  ]);
  program.addRow([
    "migration@example.test",
    "2026-02-01",
    "legacy-plan",
    "Imported plan",
    "Lower",
    "Squat",
    4,
    "6–8",
    120,
    80,
    8,
    2,
    "3-0-1-0",
  ]);
  const notes = book.addWorksheet("Notes");
  notes.addRow(["email", "date", "text"]);
  notes.addRow([
    "migration@example.test",
    "2026-02-03",
    "Private migration note",
  ]);
  return book;
}
let importedBatch: string;
it("reads every worksheet, maps Arabic/English columns and imports all dated source records", async () => {
  const file = await readImportFile(
    new Uint8Array(await (await fixtureWorkbook()).xlsx.writeBuffer()),
    "full.xlsx",
  );
  expect(workbookSheets(file)).toHaveLength(7);
  const prepared = prepareImport(
    {
      file,
      mappings: workbookSheets(file).map(autoMapping),
      mode: "skip",
      partial: false,
      ignore_unmapped: false,
      date_order: "DMY",
    },
    await snapshot(),
  );
  const result = await command<{ batch_id: string; records_inserted: number }>(
    coach,
    "import_data",
    prepared.payload,
  );
  importedBatch = result.batch_id;
  const data = await snapshot();
  const client = data.clients.find(
    (client) => client.email === "migration@example.test",
  )!;
  expect(client.name).toBe("عميل استيراد كامل");
  expect(
    data.management!.details.find((detail) => detail.client_id === client.id),
  ).toMatchObject({ height: 180, gender: "male", birth_date: "1995-04-20" });
  const history = data.management!.records.filter(
    (record) => record.client_id === client.id,
  );
  expect(
    history.filter((record) => record.kind === "measurement"),
  ).toHaveLength(4);
  expect(
    history
      .filter(
        (record) => record.kind === "measurement" && record.payload.weight,
      )
      .map((record) => [record.entry_date, record.payload.weight])
      .sort(),
  ).toEqual([
    ["2026-01-01", 90],
    ["2026-02-01", 87],
    ["2026-03-01", 85],
  ]);
  expect(
    history.find(
      (record) => record.kind === "measurement" && record.payload.custom,
    )!.payload.custom,
  ).toEqual({ neck: 38 });
  expect(
    history.find((record) => record.kind === "program_history")!.payload
      .content,
  ).toMatchObject({
    days: [
      {
        name: "Upper",
        exercises: [{ weight: 50, rpe: 8, rir: 2, tempo: "3-1-1-0" }],
      },
      { name: "Lower", exercises: [{ weight: 80 }] },
    ],
  });
  expect(history.some((record) => record.kind === "nutrition_target")).toBe(
    true,
  );
  expect(history.some((record) => record.kind === "nutrition_log")).toBe(true);
  const repeated = await command<{ replayed: boolean }>(
    coach,
    "import_data",
    prepared.payload,
  );
  expect(repeated.replayed).toBe(true);
  expect(
    (await snapshot()).management!.records.filter(
      (record) => record.client_id === client.id,
    ),
  ).toHaveLength(history.length);
});
it("does not discard mapped extra fields on a single client worksheet", async () => {
  const file = {
    headers: [
      "name",
      "email",
      "date",
      "height",
      "weight",
      "calories",
      "protein",
      "carbs",
      "fat",
      "goal",
      "target_weight",
      "notes",
    ],
    rows: [
      [
        "Single sheet client",
        "single@example.test",
        "2026-03-01",
        "175",
        "90",
        "2200",
        "150",
        "220",
        "70",
        "Fat loss",
        "80",
        "Private note",
      ],
    ],
  };
  const prepared = prepareImport(
    {
      file,
      mappings: [autoMapping({ ...file, name: "Clients" })],
      mode: "skip",
      partial: false,
      ignore_unmapped: false,
      date_order: "DMY",
    },
    await snapshot(),
  );
  await command(coach, "import_data", prepared.payload);
  const data = await snapshot(),
    client = data.clients.find(
      (client) => client.email === "single@example.test",
    )!;
  expect(
    data
      .management!.records.filter((record) => record.client_id === client.id)
      .map((record) => record.kind)
      .sort(),
  ).toEqual(["goal_history", "measurement", "note", "nutrition_target"]);
});
it("validates ambiguous/invalid dates, missing clients, unmapped fields and per-row errors", async () => {
  expect(parseImportDate("01/02/2026", "DMY")).toBe("2026-02-01");
  expect(parseImportDate("01/02/2026", "MDY")).toBe("2026-01-02");
  expect(() => parseImportDate("31/02/2026")).toThrow();
  const file = {
    headers: ["email", "date", "weight"],
    rows: [
      ["unknown@example.test", "2026-02-01", "90"],
      ["bad", "bad", "oops"],
    ],
  };
  const mapping = autoMapping({ ...file, name: "Weights" });
  expect(
    previewFullImport(file, [mapping], []).some((row) => row.errors.length),
  ).toBe(true);
  expect(() =>
    prepareImport(
      {
        file,
        mappings: [mapping],
        mode: "skip",
        partial: false,
        ignore_unmapped: false,
        date_order: "DMY",
      },
      { clients: [] },
    ),
  ).toThrow();
});
it("rolls a failed multi-row import back instead of leaving the newly created client", async () => {
  const prepared = prepareImport(
    {
      file: {
        headers: ["name", "email"],
        rows: [["Rollback client", "rollback@example.test"]],
      },
      mappings: [{ category: "clients", fields: { name: 0, email: 1 } }],
      mode: "skip",
      partial: false,
      ignore_unmapped: false,
      date_order: "DMY",
    },
    await snapshot(),
  );
  prepared.payload.rows.push({
    category: "weights",
    email: "rollback@example.test",
    data: {
      kind: "measurement",
      entry_date: today,
      payload: { weight: 99999 },
    },
    values: {},
    source_key: randomUUID(),
  } as never);
  await expect(
    command(coach, "import_data", prepared.payload),
  ).rejects.toThrow();
  expect(
    (await snapshot()).clients.some(
      (client) => client.email === "rollback@example.test",
    ),
  ).toBe(false);
});
it("undoes an untouched batch and refuses undo after client data has changed", async () => {
  await command(coach, "import_undo", { id: importedBatch });
  expect(
    (await snapshot()).clients.some(
      (client) => client.email === "migration@example.test",
    ),
  ).toBe(false);
  const file = {
    headers: ["name", "email"],
    rows: [["Changed after import", "changed-import@example.test"]],
  };
  const prepared = prepareImport(
    {
      file,
      mappings: [{ category: "clients", fields: { name: 0, email: 1 } }],
      mode: "skip",
      partial: false,
      ignore_unmapped: false,
      date_order: "DMY",
    },
    await snapshot(),
  );
  const batch = await command<{ batch_id: string }>(
    coach,
    "import_data",
    prepared.payload,
  );
  const client = (await snapshot()).clients.find(
    (client) => client.email === "changed-import@example.test",
  )!;
  await old(coach, "client_save", {
    id: client.id,
    name: "Manual change",
    email: client.email,
    phone: "",
  });
  await expect(
    command(coach, "import_undo", { id: batch.batch_id }),
  ).rejects.toThrow();
  expect((await snapshot()).clients.find((c) => c.id === client.id)!.name).toBe(
    "Manual change",
  );
});
it("exports a real multi-sheet workbook containing profiles and historical records", async () => {
  const data = await snapshot(),
    book = new ExcelJS.Workbook();
  await book.xlsx.load((await exportWorkbook(data)) as never);
  expect(book.worksheets.map((sheet) => sheet.name)).toEqual(
    expect.arrayContaining([
      "Clients",
      "Measurements",
      "NutritionTargets",
      "NutritionLogs",
      "Workouts",
      "Programs",
      "Templates",
      "Checkins",
      "Messages",
      "Subscriptions",
      "Payments",
    ]),
  );
  expect(book.getWorksheet("Clients")!.actualRowCount).toBe(
    data.clients.length + 1,
  );
  expect(book.getWorksheet("Measurements")!.views[0].rightToLeft).toBe(true);
  expect(book.getWorksheet("Measurements")!.actualRowCount).toBeGreaterThan(3);
  const read = await readImportFile(
    new Uint8Array(await book.xlsx.writeBuffer()),
    "roundtrip.xlsx",
  );
  expect(workbookSheets(read).length).toBeGreaterThan(6);
});
it("produces actionable alerts only from recorded evidence and honors inactivity/preferences", async () => {
  const data = await snapshot();
  const record = recordInput.parse({
    id: randomUUID(),
    client_id: ids[0],
    kind: "checkin",
    entry_date: today,
    payload: { ...checkin, training_adherence: 30 },
  });
  data.management!.records.unshift({
    ...record,
    payload: record.payload as Record<string, unknown>,
    coach_id: coach,
    author_id: trainee,
    author_type: "client",
    source_key: "alerts",
    created_at: new Date().toISOString(),
    read_at: null,
    reviewed_at: null,
    coach_feedback: "",
  });
  expect(
    coachingAlerts(data).some(
      (alert) => alert.clientId === ids[0] && alert.kind === "adherence",
    ),
  ).toBe(true);
  data.management!.details.find(
    (detail) => detail.client_id === ids[0],
  )!.status = "inactive";
  expect(coachingAlerts(data).some((alert) => alert.clientId === ids[0])).toBe(
    false,
  );
});

it("reconciles exported worksheets against a second coach without losing historical payloads", async () => {
  const source = await snapshot();
  const file = await readImportFile(
    new Uint8Array(await exportWorkbook(source)),
    "roundtrip.xlsx",
  );
  const mappings = workbookSheets(file).map(autoMapping);
  const preview = previewFullImport(file, mappings, []);
  expect(preview.flatMap((r) => r.errors)).toEqual([]);
  const prepared = prepareImport(
    {
      file,
      mappings,
      mode: "skip",
      partial: false,
      ignore_unmapped: false,
      date_order: "DMY",
    },
    await snapshot(other),
  );
  await command(other, "import_data", prepared.payload);
  const target = await snapshot(other);
  expect(target.clients).toHaveLength(source.clients.length);
  for (const original of source.management!.records) {
    const sourceClient = source.clients.find(
      (c) => c.id === original.client_id,
    )!;
    const targetClient = target.clients.find(
      (c) => c.email === sourceClient.email,
    )!;
    const imported = target.management!.records.find(
      (r) =>
        r.client_id === targetClient.id &&
        r.kind === original.kind &&
        r.source_key === original.source_key,
    );
    expect(imported, `${original.kind}:${original.source_key}`).toBeTruthy();
    // Program foreign keys and private photo IDs are not portable identities.
    const payload = { ...original.payload };
    delete payload.program_id;
    expect(imported!.payload).toEqual(payload);
    expect(imported!.entry_date).toBe(original.entry_date);
    if (original.kind === "message")
      expect(imported!.author_type).toBe(original.author_type);
  }
});
it("rejects source-key collisions atomically instead of silently skipping changed historical values", async () => {
  const key = "collision-test";
  await command(coach, "record_save", {
    ...record(ids[0], "measurement", { weight: 80, notes: "" }, "2026-01-01"),
    source_key: key,
  });
  const file = {
    headers: ["email", "date", "weight", "source_key"],
    rows: [["fixture-1@example.test", "2026-01-01", "81", key]],
  };
  const input = {
    file,
    mappings: [
      {
        category: "measurements",
        fields: { email: 0, date: 1, weight: 2, source_key: 3 },
      },
    ],
    mode: "skip",
    partial: false,
    ignore_unmapped: false,
    date_order: "DMY",
  };
  const prepared = prepareImport(input, await snapshot());
  await expect(
    command(coach, "import_data", prepared.payload),
  ).rejects.toThrow();
  expect(
    (await snapshot()).management!.records.find((r) => r.source_key === key)!
      .payload.weight,
  ).toBe(80);
});
it("validates nested raw RPC exercise/meal inputs, ratings and photo ownership", async () => {
  for (const payload of [
    {
      day_name: "Upper",
      completed: true,
      exercises: [{ name: "Bench", sets: 3, reps: "10", weight: -5 }],
    },
    {
      day_name: "Upper",
      completed: true,
      exercises: [{ name: "Bench", sets: 3.5, reps: "10" }],
    },
  ])
    await expect(
      command(coach, "record_save", record(ids[0], "workout_log", payload)),
    ).rejects.toThrow();
  await expect(
    command(
      coach,
      "record_save",
      record(ids[0], "nutrition_target", {
        ...macros,
        text: "",
        meals: [{ name: "Invalid", calories: -10 }],
      }),
    ),
  ).rejects.toThrow();
  await expect(
    command(
      trainee,
      "record_save",
      record(ids[0], "checkin", { ...checkin, sleep: 2.5 }),
    ),
  ).rejects.toThrow();
  const photo = await command<{ id: string }>(coach, "photo_reserve", {
    id: randomUUID(),
    client_id: ids[0],
    entry_date: today,
    filename: "test.png",
    mime: "image/png",
    size: 70,
  });
  expect(
    (await call<{ id: string }>(trainee, "photo_access", { asset: photo.id }))
      .id,
  ).toBe(photo.id);
  expect(await call(other, "photo_access", { asset: photo.id })).toBeNull();
  await expect(
    command(coach, "photo_ready", { id: photo.id }),
  ).rejects.toThrow();
  await expect(
    command(
      coach,
      "record_save",
      record(ids[1], "checkin", { ...checkin, photo_ids: [photo.id] }),
    ),
  ).rejects.toThrow();
});
it("keeps archival reversible and prevents archived client access without deleting their history", async () => {
  const before = (await snapshot()).management!.records.filter(
    (r) => r.client_id === ids[0],
  ).length;
  await command(coach, "client_archive", { client_id: ids[0], archived: true });
  await expect(
    command(
      trainee,
      "record_save",
      record(ids[0], "message", { text: "blocked" }),
    ),
  ).rejects.toThrow();
  expect(
    (await snapshot()).management!.records.filter(
      (r) => r.client_id === ids[0],
    ),
  ).toHaveLength(before);
  await command(coach, "client_archive", {
    client_id: ids[0],
    archived: false,
  });
});

it("updates only the caller display name and erases coaching data with retryable storage cleanup", async () => {
  await expect(
    call(null, "profile_update", { display_name: "Anonymous edit" }),
  ).rejects.toThrow();
  await call(coach, "profile_update", {
    display_name: "Updated fictional coach",
  });
  expect((await snapshot()).profile!.name).toBe("Updated fictional coach");
  expect((await snapshot()).profile!.role).toBe("coach");
  const client = await old<{ id: string }>(coach, "client_save", {
    name: "Erase test client",
    email: "erase-management@example.test",
    phone: "",
  });
  const eraseUser = randomUUID();
  await db.query("insert into auth.users values($1,$2,$3,now())", [
    eraseUser,
    "erase-trainee@example.test",
    passwordHash("FictionalQA2026!"),
  ]);
  await call(eraseUser, "init_profile", {
    display_name: "Erase trainee",
    requested_role: "trainee",
  });
  await db.query("update public.clients set trainee_user_id=$1 where id=$2", [
    eraseUser,
    client.id,
  ]);
  await command(
    coach,
    "record_save",
    record(client.id, "note", { text: "Sensitive deletion fixture" }),
  );
  await old(coach, "weight_save", {
    client_id: client.id,
    entry_date: today,
    weight: 80,
  });
  const photo = await command<{ id: string }>(coach, "photo_reserve", {
    id: randomUUID(),
    client_id: client.id,
    entry_date: today,
    filename: "erase.png",
    mime: "image/png",
    size: 70,
  });
  const request = await old<{ id: string }>(eraseUser, "privacy_request", {
    client_id: client.id,
    kind: "deletion",
    details: "Fictional QA erasure",
  });
  await old(coach, "privacy_fulfill", {
    id: request.id,
    resolution: "QA requested erasure",
  });
  const after = await snapshot();
  expect(after.management!.records.some((r) => r.client_id === client.id)).toBe(
    false,
  );
  expect(after.weights.some((r) => r.client_id === client.id)).toBe(false);
  expect(after.management!.progress_photos.some((r) => r.id === photo.id)).toBe(
    false,
  );
  expect(await call(trainee, "photo_access", { asset: photo.id })).toBeNull();
  const jobs = await call<Array<{ id: string }>>(coach, "photo_cleanup", {
    completed: [],
  });
  expect(jobs.some((j) => j.id === photo.id)).toBe(true);
  expect(await call(other, "photo_cleanup", { completed: [photo.id] })).toEqual(
    [],
  );
  expect(
    (
      await call<Array<{ id: string }>>(coach, "photo_cleanup", {
        completed: [],
      })
    ).some((j) => j.id === photo.id),
  ).toBe(true);
  await call(coach, "photo_cleanup", { completed: [photo.id] });
  expect(await call(coach, "photo_cleanup", { completed: [] })).toEqual([]);
});

it("preserves unmapped phone fields during an explicit client merge and handles large previews safely", async () => {
  await old(coach, "client_save", {
    id: ids[2],
    name: "Phone retained",
    email: "fixture-3@example.test",
    phone: "0501234567",
  });
  const file = {
    headers: ["name", "email"],
    rows: [["Mapped name only", "fixture-3@example.test"]],
  };
  const data = prepareImport(
    {
      file,
      mappings: [{ category: "clients", fields: { name: 0, email: 1 } }],
      mode: "merge",
      partial: false,
      ignore_unmapped: false,
      date_order: "DMY",
    },
    await snapshot(),
  );
  await command(coach, "import_data", data.payload);
  expect((await snapshot()).clients.find((c) => c.id === ids[2])!.phone).toBe(
    "0501234567",
  );
  const large = {
    headers: ["email", "date", "weight", "source_key"],
    rows: Array.from({ length: 10000 }, (_, i) => [
      "fixture-3@example.test",
      "2026-01-01",
      "80",
      "bulk-" + i,
    ]),
  };
  const mapping = {
    category: "measurements" as const,
    fields: { email: 0, date: 1, weight: 2, source_key: 3 },
  };
  const preview = previewFullImport(
    large,
    [mapping],
    ["fixture-3@example.test"],
  );
  expect(preview).toHaveLength(10000);
  expect(preview.every((r) => r.errors.length === 0)).toBe(true);
  const prepared = prepareImport(
    {
      file: large,
      mappings: [mapping],
      mode: "skip",
      partial: false,
      ignore_unmapped: false,
      date_order: "DMY",
    },
    await snapshot(),
  );
  expect(prepared.payload.rows).toHaveLength(10000);
  await command(coach, "import_data", prepared.payload);
  const count = await db.query<{ count: number }>(
    "select count(*)::int as count from public.coaching_records where client_id=$1 and source_key like 'bulk-%'",
    [ids[2]],
  );
  expect(count.rows[0].count).toBe(10000);
}, 30000);

it("keeps historical nutrition targets from overriding a more recently published plan", async () => {
  const data = await snapshot();
  const history = data.management!.records.find(
    (r) => r.kind === "nutrition_target",
  )!;
  const older = {
    ...history,
    entry_date: "2026-01-01",
    created_at: "2026-01-01T10:00:00Z",
  };
  expect(
    effectiveNutrition([older], older.client_id, "2026-02-01T10:00:00Z"),
  ).toBeUndefined();
  const current = {
    ...older,
    entry_date: "2026-03-01",
    created_at: "2026-03-01T10:00:00Z",
  };
  expect(
    effectiveNutrition(
      [older, current],
      older.client_id,
      "2026-02-01T10:00:00Z",
    )!.calories,
  ).toBe(Number(current.payload.calories));
  const sameDay = {
    ...older,
    entry_date: "2026-02-01",
    created_at: "2026-02-01T11:00:00Z",
  };
  expect(
    effectiveNutrition([sameDay], older.client_id, "2026-02-01T10:00:00Z"),
  ).toBeTruthy();
});
