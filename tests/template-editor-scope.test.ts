import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/app/actions", () => ({ mutate: vi.fn() }));
vi.mock("@/app/platform-actions", () => ({ saveTeamProgram: vi.fn(), publishTeamProgram: vi.fn() }));
vi.mock("@/app/management-actions", () => ({ manage: vi.fn() }));
vi.mock("@/app/studio-actions", () => ({ uploadTicket: vi.fn(), completeUpload: vi.fn(), phoneUploadStatus: vi.fn(), createPhoneUpload: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ProgramEditor } from "@/components/program-editor";
import { blankContent } from "@/lib/model";
import type { Client, Snapshot } from "@/lib/model";
import { NutritionTargetEditor } from "@/components/nutrition-target-editor";
const initial = structuredClone(blankContent);
initial.days[0].exercises[0].name = "ضغط الصدر";

it("keeps generic video fields while reserving load and tempo controls for individual programs", () => {
  const generic = renderToStaticMarkup(createElement(ProgramEditor, { initial, name: "قالب عام" }));
  expect(generic).toContain("فيديو شرح التمرين");
  expect(generic).toContain("رابط فيديو اختياري");
  expect(generic).not.toContain('aria-label="الوزن (كجم) للتمرين');
  expect(generic).not.toContain('aria-label="الإيقاع للتمرين');
  const personal = renderToStaticMarkup(createElement(ProgramEditor, { initial, name: "برنامج خاص", clientId: "11111111-1111-4111-8111-111111111111" }));
  expect(personal).toContain('aria-label="الوزن (كجم) للتمرين');
  expect(personal).toContain('aria-label="الإيقاع للتمرين');
});

it("shows general nutrition without common target inputs and exposes them only in the optional target preset", () => {
  const metadata = { template_id: "synthetic", description: "", archived: false, kind: "nutrition" as const };
  const general = renderToStaticMarkup(createElement(ProgramEditor, { initial, name: "أطعمة عامة", templateMeta: metadata }));
  expect(general).toContain('id="nutrition-text"');
  expect(general).not.toContain('id="nutrition-calories"');
  expect(general).not.toContain("إعداد الحصة التدريبية");
  const preset = renderToStaticMarkup(createElement(ProgramEditor, { initial, name: "أهداف مقترحة", templateMeta: { ...metadata, kind: "nutrition_targets" } }));
  expect(preset).toContain('id="nutrition-calories"');
  expect(preset).toContain("أهدافًا مقترحة");
});

it("keeps the saved individual meal plan available when editing daily targets", () => {
  const client = { id: "synthetic-client", name: "متدرب" } as Client;
  const content = structuredClone(blankContent);
  content.nutrition.meals = [{ name: "فطور خاص", time: "08:00", foods: "أطعمة شخصية محفوظة", calories: 500, protein: 30, carbs: 60, fat: 15 }];
  const data = { programs: [{ client_id: client.id, published_at: "2026-01-01T10:00:00Z", content }], weights: [], client_goals: [], management: { records: [], progress_photos: [] } } as unknown as Snapshot;
  const html = renderToStaticMarkup(createElement(NutritionTargetEditor, { data, client }));
  expect(html).toContain("أطعمة شخصية محفوظة");
  expect(html).toContain("فطور خاص");
  expect(html).toContain("اعتمد المجموع كأهداف");
});
