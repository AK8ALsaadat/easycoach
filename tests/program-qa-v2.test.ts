import { afterAll, beforeAll, expect, it } from "vitest";
import { fixtureDatabase, coach, trainee, other } from "./helpers/db";
import { parseDisplayDate } from "@/lib/date-input";
import { copyExerciseAfter, customExercise } from "@/lib/program-builder";
import { blankContent } from "@/lib/model";
import { catalog, catalogSearchRank } from "@/lib/catalog";
import { readFileSync } from "node:fs";
let fixture: Awaited<ReturnType<typeof fixtureDatabase>>;
beforeAll(async () => { fixture = await fixtureDatabase(); });
afterAll(async () => { await fixture.db.close(); });
it("counts only publications for each trainee, retaining historical row ordering", async () => {
  const client = await fixture.client();
  const content = structuredClone(blankContent); content.days[0].exercises[0].name = "سكوات";
  let saved = await fixture.app<{ id: string; publication_number: number | null }>(coach, "program_save", { client_id: client, name: "برنامج", content });
  for (let i=0;i<5;i++) saved = await fixture.app(coach,"program_save",{client_id:client,name:"برنامج",content});
  expect(saved.publication_number).toBeNull();
  const first = await fixture.app<{ publication_number: number }>(coach,"program_publish",{id:saved.id});
  expect(first.publication_number).toBe(1);
  const draft = await fixture.app<{ id: string }>(coach,"program_save",{client_id:client,name:"نسخة ثانية",content});
  const second = await fixture.app<{ publication_number: number }>(coach,"program_publish",{id:draft.id});
  expect(second.publication_number).toBe(2);
});
it("stores each set from the linked trainee, rejecting invalid sets and another coach", async () => {
  const client = await fixture.client(); await fixture.linkTrainee(client);
  const payload = {day_name:"اليوم الأول",completed:true,notes:"",exercises:[{name:"سكوات",sets:2,reps:"10/8",set_logs:[{reps:10,weight:50},{reps:8,weight:55}]}]};
  const row = {id:crypto.randomUUID(),client_id:client,kind:"workout_log",entry_date:"2026-11-14",payload};
  await fixture.manage(trainee,"record_save",row);
  const stored = await fixture.db.query<{ payload: typeof payload }>("select payload from public.coaching_records where id=$1",[row.id]);
  expect(stored.rows[0].payload.exercises[0].set_logs[1]).toEqual({reps:8,weight:55});
  await expect(fixture.manage(other,"record_save",{...row,id:crypto.randomUUID()})).rejects.toThrow();
  const bad = structuredClone(payload); bad.exercises[0].set_logs[0].reps = -1;
  await expect(fixture.manage(trainee,"record_save",{...row,id:crypto.randomUUID(),payload:bad})).rejects.toThrow();
});
it("backfills existing immutable publications and restores their protection", async () => {
  const existing=await fixture.db.query<{id:string;content:unknown}>("select id,content from public.programs where published_at is not null order by version");
  expect(existing.rows.length).toBeGreaterThan(0);
  await fixture.db.exec("drop trigger number_program_publication on public.programs; drop function private.number_program_publication(); alter table public.programs drop column publication_number;");
  await fixture.db.transaction(async tx=>{ await tx.exec(readFileSync("supabase/migrations/20261114180000_program_publication_numbers.sql","utf8")); });
  const after=await fixture.db.query<{id:string;content:unknown;publication_number:number}>("select id,content,publication_number from public.programs where published_at is not null order by version");
  expect(after.rows.map(({id,content})=>({id,content}))).toEqual(existing.rows);
  expect(after.rows.every(row=>Number(row.publication_number)>0)).toBe(true);
  await expect(fixture.db.query("update public.programs set name='should remain immutable' where id=$1",[existing.rows[0].id])).rejects.toThrow("البرنامج المنشور ثابت");
});
it("copies immediately after the source with independent row identities", () => {
  const plan=structuredClone(blankContent); plan.days[0].exercises=[customExercise("الأول"),customExercise("الثاني")];
  const next=copyExerciseAfter(plan,0,0);
  expect(next.days[0].exercises.map(row=>row.name)).toEqual(["الأول","الأول","الثاني"]);
  expect(next.days[0].exercises[1].rowId).not.toBe(plan.days[0].exercises[0].rowId);
});
it("parses day/month/year and Arabic digits without accepting impossible dates", () => {
  expect(parseDisplayDate("١٤/١١/٢٠٢٦")).toBe("2026-11-14");
  expect(parseDisplayDate("14/11/2026")).toBe("2026-11-14");
  expect(parseDisplayDate("31/02/2026")).toBeNull();
});
it("ranks name matches above muscle metadata matches", () => {
  const bench=catalog.find(row=>row.id==="Dumbbell_Bench_Press")!;
  const fly=catalog.find(row=>row.id==="Dumbbell_Flyes")!;
  expect(catalogSearchRank(bench,"ضغط بنش")).toBeGreaterThan(catalogSearchRank(fly,"ضغط بنش"));
});
