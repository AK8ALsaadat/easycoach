import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { openDatabase, rpcLocal, LOCAL_IDS } from "@/lib/local-db";
import { blankContent, content as contentSchema, type Content } from "@/lib/model";
import { parseReps, parseRest, parseSets, publishIssues } from "@/lib/program-validation";

const named = (overrides: Partial<Content> = {}): Content => ({
  ...structuredClone(blankContent),
  days: [{ name: "اليوم الأول", exercises: [{ name: "سكوات", description: "", video: "", sets: 3, reps: "8–12", rest: 90 }] }],
  ...overrides,
});

it("validates sets, reps and rest as typed text", () => {
  expect(parseSets("4")).toEqual({ value: 4 });
  expect(parseSets("٣")).toEqual({ value: 3 });
  for (const bad of ["abc", "-5", "0", "21", "2.5", ""]) expect(parseSets(bad).error).toBe("المجموعات عدد صحيح من 1 إلى 20");
  expect(parseReps("10")).toEqual({ value: "10" });
  expect(parseReps("8-12")).toEqual({ value: "8–12" });
  expect(parseReps(" 8 – 12 ")).toEqual({ value: "8–12" });
  for (const bad of ["abc", "-5", "12-8", "0", "8-", "10 لكل رجل"]) expect(parseReps(bad).error).toBe("التكرارات رقم أو مدى مثل 8-12");
  expect(parseRest("0")).toEqual({ value: 0 });
  expect(parseRest("600")).toEqual({ value: 600 });
  for (const bad of ["601", "-5", "abc", "1.5"]) expect(parseRest(bad).error).toBe("الراحة من 0 إلى 600 ثانية");
});

it("rejects invalid table values on the server schema too", () => {
  const bad = named();
  bad.days[0].exercises[0] = { ...bad.days[0].exercises[0], reps: "abc", sets: -5 };
  const result = contentSchema.safeParse(bad);
  expect(result.success).toBe(false);
  expect(result.error?.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining(["المجموعات عدد صحيح من 1 إلى 20", "التكرارات رقم أو مدى مثل 8-12"]));
  expect(contentSchema.safeParse(named()).success).toBe(true);
});

it("lists default exercise names and empty meals before publishing", () => {
  const plan = named();
  plan.days.push({ name: "اليوم الثاني", exercises: [{ ...plan.days[0].exercises[0] }, { ...plan.days[0].exercises[0], name: "تمرين جديد" }] });
  plan.nutrition.meals = [
    { name: "الفطور", time: "", foods: "", calories: 0, protein: 0, carbs: 0, fat: 0 },
    { name: "الغداء", time: "", foods: "دجاج وأرز", calories: 0, protein: 0, carbs: 0, fat: 0 },
    { name: "العشاء", time: "", foods: "", calories: 400, protein: 30, carbs: 40, fat: 13.3 },
  ];
  expect(publishIssues(plan).map(({ kind, day, index }) => ({ kind, day, index }))).toEqual([
    { kind: "exercise", day: 1, index: 1 },
    { kind: "meal", day: undefined, index: 0 },
  ]);
  expect(publishIssues(named())).toEqual([]);
});

let db: PGlite;
let client = "";
const app = <T,>(command: string, payload: unknown) => rpcLocal<T>(db, LOCAL_IDS.coach, "app_command", { command, payload });
beforeAll(async () => {
  db = await openDatabase();
  await db.query("insert into auth.users values($1,'publish@example.test','synthetic',now())", [LOCAL_IDS.coach]);
  await rpcLocal(db, LOCAL_IDS.coach, "init_profile", { display_name: "مدرب", requested_role: "coach" });
  client = (await app<{ id: string }>("client_save", { name: "متدرب", email: "publish-client@example.test", phone: "" })).id;
}, 120000);
afterAll(async () => { await db?.close(); });

it("refuses to publish default names or empty meals in the database", async () => {
  const draft = await app<{ id: string }>("program_save", { client_id: client, name: "برنامج", content: blankContent });
  await expect(app("program_publish", { id: draft.id })).rejects.toThrow("تمرين جديد");
  const meals = named();
  meals.nutrition.meals = [{ name: "الفطور", time: "", foods: "", calories: 0, protein: 0, carbs: 0, fat: 0 }];
  await app("program_save", { client_id: client, name: "برنامج", content: meals });
  await expect(app("program_publish", { id: draft.id })).rejects.toThrow("وجبة فارغة");
  await app("program_save", { client_id: client, name: "برنامج", content: named() });
  const published = await app<{ published_at: string | null }>("program_publish", { id: draft.id });
  expect(published.published_at).toBeTruthy();
});

it("persists explicit coach instructions separately from legacy descriptions and validates direct database writes", async () => {
  const plan = named();
  plan.days[0].exercises[0].description = "Legacy library description";
  plan.days[0].exercises[0].coachNotes = "توقف ثانية.\nخفف الوزن عند الحاجة.";
  expect(contentSchema.safeParse(plan).success).toBe(true);
  const saved = await app<{ id: string; content: Content }>("program_save", { client_id: client, name: "توجيهات خاصة", content: plan });
  expect(saved.content.days[0].exercises[0]).toMatchObject({ description: "Legacy library description", coachNotes: "توقف ثانية.\nخفف الوزن عند الحاجة." });
  const published = await app<{ content: Content }>("program_publish", { id: saved.id });
  expect(published.content.days[0].exercises[0].coachNotes).toBe(plan.days[0].exercises[0].coachNotes);
  for (const bad of [null, 3, "a".repeat(2001)]) {
    const invalid = structuredClone(plan);
    Object.assign(invalid.days[0].exercises[0], { coachNotes: bad });
    expect(contentSchema.safeParse(invalid).success).toBe(false);
    const result = await db.query<{ valid: boolean }>("select public.valid_content($1::jsonb) as valid", [JSON.stringify(invalid)]);
    expect(result.rows[0].valid).toBe(false);
    await expect(app("program_save", { client_id: client, name: "Invalid notes", content: invalid })).rejects.toThrow();
  }
  expect((await db.query<{ valid: boolean }>("select public.valid_content($1::jsonb) as valid", [JSON.stringify(named())])).rows[0].valid).toBe(true);
});
