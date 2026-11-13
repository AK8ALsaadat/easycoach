import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { blankContent, type Snapshot } from "@/lib/model";
import { isUnnamedTemplate, suggestCopyName, templateNameError } from "@/lib/template-names";
import { managementCommands } from "@/lib/management";
import { coach, other, fixtureDatabase } from "./helpers/db";

describe("template name rules", () => {
  const existing = [{ id: "a", name: "تضخيم  للمبتدئين" }];
  it("requires 2–60 visible characters and rejects placeholder names", () => {
    expect(templateNameError("")).toBe("اكتب اسم القالب");
    expect(templateNameError("    ")).toBe("اكتب اسم القالب");
    expect(templateNameError("أ")).toContain("من 2 إلى 60");
    expect(templateNameError("ب".repeat(61))).toContain("من 2 إلى 60");
    expect(templateNameError("ب".repeat(60))).toBeNull();
    expect(templateNameError("قالب جديد")).toContain("اسمًا واضحًا");
    expect(templateNameError(" مسودة   جديدة ")).toContain("اسمًا واضحًا");
    expect(templateNameError("قالب جديد للمبتدئين")).toBeNull();
  });
  it("detects duplicates ignoring case and extra spaces, but not the template itself", () => {
    expect(templateNameError("  تضخيم للمبتدئين ", existing)).toBe("عندك قالب بنفس الاسم");
    expect(templateNameError("Push Day", [{ id: "b", name: "push   day" }])).toBe("عندك قالب بنفس الاسم");
    expect(templateNameError("تضخيم للمبتدئين", existing, "a")).toBeNull();
  });
  it("suggests (نسخة) then (نسخة 2) and stays within 60 characters", () => {
    expect(suggestCopyName("أساسيات", [])).toBe("أساسيات (نسخة)");
    expect(suggestCopyName("أساسيات", [{ name: "أساسيات (نسخة)" }])).toBe("أساسيات (نسخة 2)");
    expect(suggestCopyName("أساسيات (نسخة)", [{ name: "أساسيات (نسخة)" }])).toBe("أساسيات (نسخة 2)");
    expect(suggestCopyName("ج".repeat(60), []).length).toBeLessThanOrEqual(60);
  });
  it("flags legacy placeholder templates as unnamed", () => {
    expect(isUnnamedTemplate("قالب جديد")).toBe(true);
    expect(isUnnamedTemplate("قالب جديد · نسخة")).toBe(true);
    expect(isUnnamedTemplate("قالب جديد (2)")).toBe(true);
    expect(isUnnamedTemplate("برنامج القوة")).toBe(false);
  });
  it("server schema rejects bad names for new templates with Arabic messages", () => {
    const bad = managementCommands.template_save_typed.safeParse({ name: "قالب جديد", content: blankContent, kind: "workout" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toContain("اسمًا واضحًا");
    // Existing legacy templates can still autosave their content.
    expect(managementCommands.template_save_typed.safeParse({ id: randomUUID(), name: "قالب جديد", content: blankContent, kind: "workout" }).success).toBe(true);
    expect(managementCommands.template_rename.safeParse({ id: randomUUID(), name: " " }).success).toBe(false);
  });
});

describe("database enforcement", () => {
  let f: Awaited<ReturnType<typeof fixtureDatabase>>;
  beforeAll(async () => {
    f = await fixtureDatabase();
  });
  afterAll(async () => f?.db.close());
  const create = (owner: string, name: string, extra: Record<string, unknown> = {}) =>
    f.manage<{ id: string; name: string }>(owner, "template_save_typed", { name, content: blankContent, kind: "workout", description: "", archived: false, ...extra });
  const meta = async (id: string) => (await f.call<Snapshot>(coach, "management_snapshot")).management!.template_metadata.find((m) => m.template_id === id);

  it("enforces a unique normalized name per coach", async () => {
    const first = await create(coach, "دفع وسحب");
    expect(first.name).toBe("دفع وسحب");
    await expect(create(coach, "  دفع   وسحب ")).rejects.toThrow("عندك قالب بنفس الاسم");
    await expect(create(coach, "PUSH day")).resolves.toBeTruthy();
    await expect(create(coach, "push   DAY")).rejects.toThrow("عندك قالب بنفس الاسم");
    // Another coach may use the same name.
    await expect(create(other, "دفع وسحب")).resolves.toBeTruthy();
  });

  it("rejects placeholder, too short and too long names even when called directly", async () => {
    await expect(f.app(coach, "template_save", { name: "قالب جديد", content: blankContent })).rejects.toThrow();
    await expect(create(coach, "مسودة جديدة")).rejects.toThrow();
    await expect(create(coach, "ب".repeat(61))).rejects.toThrow("من 2 إلى 60");
  });

  it("stores optional tags and copies them with suggested copy names", async () => {
    const source = await create(coach, "تنشيف متقدم", { goal: "fat_loss", level: "advanced", days_per_week: 5 });
    expect(await meta(source.id)).toMatchObject({ goal: "fat_loss", level: "advanced", days_per_week: 5 });
    const copy1 = await f.manage<{ id: string; name: string }>(coach, "template_duplicate", { id: source.id });
    const copy2 = await f.manage<{ id: string; name: string }>(coach, "template_duplicate", { id: source.id });
    expect(copy1.name).toBe("تنشيف متقدم (نسخة)");
    expect(copy2.name).toBe("تنشيف متقدم (نسخة 2)");
    expect(await meta(copy1.id)).toMatchObject({ goal: "fat_loss", level: "advanced", days_per_week: 5 });
    await expect(f.manage(coach, "template_duplicate", { id: source.id, name: "تنشيف متقدم" })).rejects.toThrow("عندك قالب بنفس الاسم");
  });

  it("legacy unnamed templates keep saving content but must be named before use", async () => {
    await f.db.query("alter table public.templates disable trigger check_template_name");
    const legacy = (await f.db.query<{ id: string }>("insert into public.templates(coach_id,name,content) values($1,'قالب جديد',$2) returning id", [coach, JSON.stringify(blankContent)])).rows[0].id;
    await f.db.query("alter table public.templates enable trigger check_template_name");
    await expect(f.manage(coach, "template_save_typed", { id: legacy, name: "قالب جديد", content: blankContent, kind: "workout", description: "", archived: false })).resolves.toBeTruthy();
    const client = await f.client();
    await expect(f.manage(coach, "template_assign", { id: legacy, clients: [client] })).rejects.toThrow(/سمِّ القالب/);
    await expect(f.manage(coach, "template_touch", { id: legacy })).rejects.toThrow(/سمِّ القالب/);
    await f.manage(coach, "template_rename", { id: legacy, name: "قوة · 3 أيام" });
    await expect(f.manage(coach, "template_assign", { id: legacy, clients: [client] })).resolves.toBeTruthy();
    expect((await meta(legacy))?.last_used_at).toBeTruthy();
  });

  it("records last use and keeps another coach out", async () => {
    const t = await create(coach, "أساسيات الجسم");
    await f.manage(coach, "template_touch", { id: t.id });
    expect((await meta(t.id))?.last_used_at).toBeTruthy();
    await expect(f.manage(other, "template_touch", { id: t.id })).rejects.toThrow();
    await expect(f.manage(other, "template_rename", { id: t.id, name: "سرقة القالب" })).rejects.toThrow();
  });
});
