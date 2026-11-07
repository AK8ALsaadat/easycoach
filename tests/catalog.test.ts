import { describe, expect, it } from "vitest";
import {
  catalog,
  catalogSearch,
  exerciseInstructions,
  exerciseName,
} from "@/lib/catalog";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ExerciseIcon } from "@/components/exercise-icon";

describe("Arabic exercise library", () => {
  it("provides a local Arabic name and nonempty Arabic instructions for every exercise", () => {
    expect(catalog.length).toBe(876);
    for (const exercise of catalog) {
      expect(exerciseName(exercise), exercise.id).toMatch(/[\u0600-\u06ff]/);
      expect(exerciseName(exercise), exercise.id).not.toMatch(/\?{2}/);
      const steps = exerciseInstructions(exercise);
      expect(steps.length, exercise.id).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step, exercise.id).toMatch(/[\u0600-\u06ff]/);
        expect(step, exercise.id).not.toMatch(/\|\|\|/);
        expect(step, exercise.id).not.toMatch(/\?{2}/);
      }
    }
  });

  it("keeps Arabic and original English search working", () => {
    const squat = catalog.find((e) => e.id === "Barbell_Squat")!;
    expect(catalogSearch(squat, "سكوات")).toBe(true);
    expect(catalogSearch(squat, "Barbell Squat")).toBe(true);
    expect(catalogSearch(squat, "أمامية الفخذ")).toBe(true);
    expect(catalogSearch(squat, "لا توجد هذه الحركة")).toBe(false);
  });

  it("renders local vector icons without requesting photographic assets", () => {
    for (const exercise of catalog) {
      const html = renderToStaticMarkup(
        createElement(ExerciseIcon, { exercise }),
      );
      expect(html, exercise.id).toContain("<svg");
      expect(html, exercise.id).not.toContain("<img");
      expect(html, exercise.id).not.toContain("/exercises/");
    }
  });
});
