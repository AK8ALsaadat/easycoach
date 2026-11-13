import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProgramView } from "@/components/program-view";
import { blankContent, type Content, type Program } from "@/lib/model";
import { resolveWorkoutDay } from "@/lib/trainee-workout-day";
import { riyadhToday } from "@/lib/dates";

const nutrition: Content["nutrition"] = { text: "خطة مستقلة للمتدرب", calories: 2240, protein: 143, carbs: 264, fat: 68 };

it("renders independently assigned nutrition even before a workout is published", () => {
  const html = renderToStaticMarkup(createElement(ProgramView, { program: undefined, nutrition }));
  expect(html).toContain("برنامجك قيد التجهيز");
  expect(html).toContain("خطة مستقلة للمتدرب");
  for (const value of [2240, 143, 264, 68]) expect(html).toContain(String(value));
  expect(html).not.toContain("آخر نسخة منشورة");
});

it("keeps the empty state honest when neither a workout nor nutrition is assigned", () => {
  const html = renderToStaticMarkup(createElement(ProgramView, { program: undefined }));
  expect(html).toContain("برنامجك قيد التجهيز");
  expect(html).not.toContain("خطة التغذية");
});

it("uses the assigned personal nutrition instead of inherited program macros", () => {
  const content = structuredClone(blankContent);
  content.nutrition.calories = 4500;
  const program = { id: "synthetic", name: "برنامج محفوظ", content, published_at: "2026-11-10T12:00:00Z", version: 1 } as Program;
  const html = renderToStaticMarkup(createElement(ProgramView, { program, nutrition }));
  expect(html).toContain("برنامج محفوظ");
  expect(html).toContain("2240");
  expect(html).not.toContain("4500");
});

it("falls back to a real day after a published program shrinks", () => {
  const days = structuredClone(blankContent.days);
  expect(resolveWorkoutDay(5, days, 2)).toBe(0);
  days[0].weekday = 2;
  expect(resolveWorkoutDay(5, days, 2)).toBe(0);
  expect(resolveWorkoutDay(5, days, 3)).toBe(-1);
});

it("distinguishes scheduled rest days, unscheduled programs and explicit day navigation", () => {
  const days = structuredClone(blankContent.days);
  expect(resolveWorkoutDay(null, days, 3)).toBe(0);
  expect(resolveWorkoutDay(-1, days, 3)).toBe(0);
  days[0].weekday = 2;
  expect(resolveWorkoutDay(null, days, 3)).toBe(-1);
  expect(resolveWorkoutDay(null, days, 2)).toBe(0);
  expect(resolveWorkoutDay(0, days, 3)).toBe(0);
  expect(resolveWorkoutDay(null, [], 2)).toBe(-1);
});

it("explains a rest day for a one-day program and allows opening its assigned workout", () => {
  const content = structuredClone(blankContent);
  const weekday = new Date(riyadhToday() + "T12:00:00Z").getUTCDay();
  content.days[0].weekday = (weekday + 1) % 7;
  const program = { id: "synthetic", name: "حصة أسبوعية", content, published_at: "2026-11-10T12:00:00Z", version: 1 } as Program;
  const html = renderToStaticMarkup(createElement(ProgramView, { program, focusToday: true, section: "training" }));
  expect(html).toContain("يوم راحة حسب جدولك");
  expect(html).toContain('aria-pressed="false"');
});

it("shows coach instructions and avoids a redundant day selector for a single active workout", () => {
  const content = structuredClone(blankContent);
  content.days[0].weekday = new Date(riyadhToday() + "T12:00:00Z").getUTCDay();
  content.days[0].exercises[0].description = "LEGACY_LIBRARY_TEXT";
  content.days[0].exercises[0].coachNotes = "توقف ثانية أسفل الحركة.\nحافظ على وتيرة مريحة.";
  const program = { id: "synthetic", name: "برنامج", content, published_at: "2026-11-10T12:00:00Z", version: 1 } as Program;
  const html = renderToStaticMarkup(createElement(ProgramView, { program, focusToday: true, section: "training" }));
  expect(html).toContain("توقف ثانية أسفل الحركة.\nحافظ على وتيرة مريحة.");
  expect(html).not.toContain("LEGACY_LIBRARY_TEXT");
  expect(html).toContain("تم تحديد حصة اليوم حسب جدولك");
  expect(html).not.toContain("aria-pressed");
});
