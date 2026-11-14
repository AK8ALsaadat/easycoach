import { openLegacyDatabase as openDatabase } from "./helpers/legacy-db";
import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { rpcLocal, LOCAL_IDS } from "@/lib/local-db";
import { blankContent, type Content, type Snapshot } from "@/lib/model";
import { riyadhToday } from "@/lib/dates";
import { effectiveNutrition } from "@/lib/management";
let db: PGlite;
const coach = LOCAL_IDS.coach, other = LOCAL_IDS.other;
const command = <T = Record<string, unknown>>(kind: string, payload: unknown, user = coach) => rpcLocal<T>(db, user, "app_command", { command: kind, payload });
const manage = <T = Record<string, unknown>>(kind: string, payload: unknown, user = coach) => rpcLocal<T>(db, user, "management_command", { command: kind, payload });
const snapshot = () => rpcLocal<Snapshot>(db, coach, "management_snapshot");
const macros = (calories: number) => ({ calories, protein: calories / 20, carbs: calories / 8, fat: calories / 40 });
async function fixture(kind: "workout" | "nutrition" | "nutrition_targets") {
  const clients: string[] = [];
  for (const calories of [1700, 2800]) {
    const client = await command<{ id: string }>("client_save", { name: "عميل أهداف مستقلة", email: randomUUID() + "@example.test", phone: "" });
    clients.push(client.id);
    await manage("record_save", { id: randomUUID(), client_id: client.id, kind: "nutrition_target", entry_date: riyadhToday(), payload: { ...macros(calories), text: "خطة شخصية", meals: [{ name: "الفطور", time: "08:00", foods: "طعام شخصي", ...macros(calories / 4) }] } });
  }
  const content = structuredClone(blankContent);
  content.days[0].exercises[0] = { ...content.days[0].exercises[0], name: "تمرين عام", video: "https://example.test/video", weight: 95, rpe: 9, rir: 1, tempo: "3-1-1-0" };
  content.nutrition = { ...macros(3900), text: "أطعمة عامة", meals: [{ name: "الفطور", time: "09:00", foods: "طعام القالب", ...macros(1000) }] };
  const template = await manage<{ id: string }>("template_save_typed", { name: "قالب عام " + randomUUID().slice(0, 8), content, kind, description: "وصف محفوظ", archived: false });
  return { clients, template, content };
}
beforeAll(async () => {
  db = await openDatabase();
  for (const uid of [coach, other]) {
    await db.query("insert into auth.users values($1,$2,'synthetic',now())", [uid, uid + "@example.test"]);
    await rpcLocal(db, uid, "init_profile", { display_name: "مدرب اصطناعي", requested_role: "coach" });
  }
});
afterAll(async () => { await db?.close(); });

it("assigns general food instructions to two trainees without sharing their daily or meal targets or creating workouts", async () => {
  const { clients, template } = await fixture("nutrition");
  const operation = { id: template.id, clients, replace_drafts: false, publish: false, operation_id: randomUUID() };
  const first = await manage<{ nutrition_ids: string[]; program_ids: string[] }>("template_assign", operation);
  expect(first.program_ids).toEqual([]); expect(first.nutrition_ids).toHaveLength(2);
  const state = await snapshot();
  expect(state.programs.filter(program => clients.includes(program.client_id))).toHaveLength(0);
  for (const [index, client] of clients.entries()) {
    const latest = state.management!.records.find(record => record.id === first.nutrition_ids[index]);
    // Assignment locks in sorted ID order, so resolve using client ownership instead of array position.
    const saved = state.management!.records.find(record => first.nutrition_ids.includes(record.id) && record.client_id === client)!;
    expect(saved.payload).toMatchObject({ ...macros(index === 0 ? 1700 : 2800), text: "أطعمة عامة" });
    expect((saved.payload.meals as Content["nutrition"]["meals"])![0]).toMatchObject({ foods: "طعام القالب", ...macros((index === 0 ? 1700 : 2800) / 4) });
    expect(latest).toBeTruthy();
  }
  expect(await manage("template_assign", operation)).toEqual(first);
  expect((await snapshot()).management!.records.filter(record => first.nutrition_ids.includes(record.id))).toHaveLength(2);
  await expect(manage("template_assign", { ...operation, clients: [clients[0]] })).rejects.toThrow("المحاولة مختلفة");
});

it("keeps personal nutrition when assigning training and excludes personal loads from new generic copies without rewriting the template", async () => {
  const { clients, template, content } = await fixture("workout");
  await manage("template_assign", { id: template.id, clients, replace_drafts: false, publish: true });
  const state = await snapshot();
  for (const [index, client] of clients.entries()) {
    const program = state.programs.find(program => program.client_id === client)!;
    expect(program.content.nutrition).toMatchObject(macros(index === 0 ? 1700 : 2800));
    expect(program.content.days[0].exercises[0]).toMatchObject({ video: "https://example.test/video" });
    for (const field of ["weight", "rpe", "rir", "tempo"]) expect(program.content.days[0].exercises[0]).not.toHaveProperty(field);
  }
  expect(state.templates.find(item => item.id === template.id)?.content).toEqual(content);
  await manage("template_delete", { id: template.id });
  expect((await snapshot()).programs.filter(program => clients.includes(program.client_id))).toHaveLength(2);
});

it("only the explicitly optional nutrition-with-targets kind copies preset targets and preserves previous history", async () => {
  const { clients, template } = await fixture("nutrition_targets");
  const result = await manage<{ nutrition_ids: string[] }>("template_assign", { id: template.id, clients, replace_drafts: false, publish: false });
  const state = await snapshot();
  for (const client of clients) {
    expect(state.management!.records.find(record => result.nutrition_ids.includes(record.id) && record.client_id === client)?.payload).toMatchObject(macros(3900));
    expect(state.management!.records.filter(record => record.client_id === client && record.kind === "nutrition_target")).toHaveLength(2);
  }
});

it("rejects cross-coach assignment/delete and rolls back a typed template save with an invalid kind", async () => {
  const { clients, template, content } = await fixture("nutrition");
  await expect(manage("template_assign", { id: template.id, clients }, other)).rejects.toThrow();
  await expect(manage("template_delete", { id: template.id }, other)).rejects.toThrow();
  const before = (await snapshot()).templates.length;
  await expect(manage("template_save_typed", { name: "قالب غير صالح", content, kind: "invalid" })).rejects.toThrow();
  expect((await snapshot()).templates).toHaveLength(before);
});

it("keeps a same-day personal target authoritative when a workout is published later that day", async () => {
  const { clients } = await fixture("nutrition");
  const state = await snapshot();
  const records = state.management!.records.filter(record => record.client_id === clients[0]);
  const day = riyadhToday();
  const beforePublish = records.map(record => ({ ...record, entry_date: day, created_at: day + "T07:00:00Z" }));
  expect(effectiveNutrition(beforePublish, clients[0], day + "T08:00:00Z")?.calories).toBe(1700);
});
