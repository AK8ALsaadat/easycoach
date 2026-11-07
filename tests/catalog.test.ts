import { describe, expect, it } from "vitest";
import {
  catalog,
  catalogSearch,
  exerciseInstructions,
  exerciseName,
} from "@/lib/catalog";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ExerciseVisual } from "@/components/exercise-visual";
import { exerciseMedia, exerciseMediaUrl } from "@/lib/exercise-media";
import coverage from "@/docs/exercise-media-coverage.json";

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

  it("uses exact licensed media or an explicit neutral fallback, never a guessed pose", () => {
    for (const exercise of catalog) {
      const html = renderToStaticMarkup(
        createElement(ExerciseVisual, { exercise }),
      );
      expect(html, exercise.id).not.toContain("/exercises/");
      expect(html, exercise.id).not.toContain("exercise-pictogram");
      if (Object.hasOwn(exerciseMedia, exercise.id)) {
        expect(html, exercise.id).toContain('data-media-status="verified"');
        expect(html, exercise.id).toContain(
          exerciseMediaUrl(exercise.id, "poster"),
        );
      } else {
        expect(html, exercise.id).not.toContain("<img");
        expect(html, exercise.id).toContain("الصورة التوضيحية غير متاحة");
      }
    }
  });

  it("has one distinct reviewed asset per supported exercise and rejects unreviewed variations", () => {
    const entries = Object.entries(exerciseMedia);
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map(([, asset]) => asset.slug)).size).toBe(
      entries.length,
    );
    for (const [id, asset] of entries) {
      expect(catalog.some((exercise) => exercise.id === id)).toBe(true);
      expect(asset.license).toBe("https://movekit.com/license");
    }
    expect(
      exerciseMediaUrl("Incline_Dumbbell_Flyes", "poster"),
    ).toBeUndefined();
    expect(exerciseMediaUrl("Wide-Grip_Pull-Up", "poster")).toBeUndefined();
    expect(exerciseMediaUrl("__proto__", "poster")).toBeUndefined();
  });

  it("reports every missing exercise without hiding or dropping catalog entries", () => {
    expect(coverage.total).toBe(catalog.length);
    expect(coverage.available).toBe(Object.keys(exerciseMedia).length);
    expect(coverage.missing.map((entry) => entry.id).sort()).toEqual(
      catalog
        .filter((exercise) => !Object.hasOwn(exerciseMedia, exercise.id))
        .map((exercise) => exercise.id)
        .sort(),
    );
    expect(coverage.unavailable + coverage.available).toBe(catalog.length);
  });
});
