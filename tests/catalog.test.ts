import { describe, expect, it } from "vitest";
import { catalog, catalogSearch, exerciseName } from "@/lib/catalog";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ExerciseVisual } from "@/components/exercise-visual";
import { ProgramView } from "@/components/program-view";
import { blankContent,type Program } from "@/lib/model";
import { exerciseImageUrl, exerciseMedia, exerciseMediaUrl } from "@/lib/exercise-media";
import coverage from "@/docs/exercise-media-coverage.json";
import reviewedPhotos from "@/lib/exercise-data/reviewed-photos.json";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";

describe("Arabic exercise library", () => {
  it("never renders old movement descriptions or catalog instructions to the trainee",()=>{
    const content=structuredClone(blankContent);content.days[0].exercises[0]={...content.days[0].exercises[0],catalogId:"Barbell_Squat",name:"Barbell Squat",description:"LEGACY_MOVEMENT_INSTRUCTION_DO_NOT_RENDER"};
    const program={id:"test",name:"برنامج",content,published_at:"2026-11-10T12:00:00Z",version:1} as Program;
    const html=renderToStaticMarkup(createElement(ProgramView,{program}));expect(html).not.toContain("LEGACY_MOVEMENT_INSTRUCTION_DO_NOT_RENDER");expect(html).not.toContain("program-instructions");expect(html).not.toContain("طريقة أداء التمرين");
  });
  it("provides Arabic names without shipping movement instructions", () => {
    expect(catalog.length).toBe(876);
    for (const exercise of catalog) {
      expect(exerciseName(exercise), exercise.id).toMatch(/[\u0600-\u06ff]/);
      expect(exerciseName(exercise), exercise.id).not.toMatch(/\?{2}/);
      expect(exercise, exercise.id).not.toHaveProperty("instructions");
    }
  });

  it("keeps Arabic and original English search working", () => {
    const squat = catalog.find((exercise) => exercise.id === "Barbell_Squat")!;
    expect(catalogSearch(squat, "سكوات")).toBe(true);
    expect(catalogSearch(squat, "Barbell Squat")).toBe(true);
    expect(catalogSearch(squat, "أمامية الفخذ")).toBe(true);
    expect(catalogSearch(squat, "لا توجد هذه الحركة")).toBe(false);
  });

  it("renders only reviewed male-instructor photos for every catalog entry", () => {
    for (const exercise of catalog) {
      const html = renderToStaticMarkup(createElement(ExerciseVisual, { exercise }));
      expect(html, exercise.id).not.toContain("exercise-pictogram");
      const expectedUrl = exerciseImageUrl(exercise.id);
      expect(expectedUrl, exercise.id).toBe(`/exercises/${encodeURIComponent(exercise.id)}.webp`);
      expect(html, exercise.id).toContain('data-media-status="reviewed-photo"');
      expect(html, exercise.id).toContain(expectedUrl);
      expect(html, exercise.id).not.toContain('/api/exercise-media/');
      expect(html, exercise.id).not.toContain('مجسم تشريحي');
    }
  });

  it("preserves the separately licensed animations and rejects unknown photo IDs", () => {
    const entries = Object.entries(exerciseMedia);
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map(([, asset]) => asset.slug)).size).toBe(entries.length);
    for (const [id, asset] of entries) {
      expect(catalog.some((exercise) => exercise.id === id)).toBe(true);
      expect(asset.license).toBe("https://movekit.com/license");
    }
    expect(exerciseMediaUrl("Incline_Dumbbell_Flyes", "poster")).toBeUndefined();
    expect(exerciseMediaUrl("__proto__", "poster")).toBeUndefined();
    expect(exerciseImageUrl("Barbell_Squat")).toBe('/exercises/Barbell_Squat.webp');
    expect(exerciseMediaUrl("Pullups", "poster", "test-proof")).toBe('/api/exercise-media/Pullups?kind=poster&portal=test-proof');
    expect(exerciseImageUrl("unreviewed-new-exercise")).toBeUndefined();
    expect(exerciseImageUrl("__proto__")).toBeUndefined();
  });

  it("matches all reviewed photo hashes and rejects blank or unreadable images", async () => {
    expect(Object.keys(reviewedPhotos.photos).sort()).toEqual(catalog.map(e => e.id).sort());
    for (const [id, hash] of Object.entries(reviewedPhotos.photos)) {
      const bytes = readFileSync(`public/exercises/${id}.webp`);
      expect(createHash('sha256').update(bytes).digest('hex'), id).toBe(hash);
      const stats = await sharp(bytes).stats();
      expect(Math.max(...stats.channels.map(channel => channel.stdev)), id).toBeGreaterThan(3);
    }
  }, 60000);

  it("retains the animated-media coverage report", () => {
    expect(coverage.total).toBe(catalog.length);
    expect(coverage.available).toBe(Object.keys(exerciseMedia).length);
    expect(coverage.missing.map((entry) => entry.id).sort()).toEqual(
      catalog.filter((exercise) => !Object.hasOwn(exerciseMedia, exercise.id)).map((exercise) => exercise.id).sort(),
    );
    expect(coverage.unavailable + coverage.available).toBe(catalog.length);
  });
});
