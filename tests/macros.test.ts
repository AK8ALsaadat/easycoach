import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  calorieMismatch,
  caloriesFromMacros,
  gramsFromSplit,
  inferCaloriesMode,
  macroSplit,
  macroTargetErrors,
  parseAmount,
  remainingAgainstTarget,
  sumMeals,
  validSplit,
  withCaloriesMode,
} from "@/lib/macros";
import { content, blankContent } from "@/lib/model";
import { recordSchemas, readNutritionTarget } from "@/lib/management";
import { countLabel, nouns } from "@/lib/plural";
import { riyadhToday } from "@/lib/dates";
import { coach, fixtureDatabase } from "./helpers/db";

describe("calories from macros", () => {
  it("applies protein×4 + carbs×4 + fat×9", () => {
    expect(caloriesFromMacros({ protein: 150, carbs: 250, fat: 65 })).toBe(2185);
    expect(caloriesFromMacros({ protein: 0, carbs: 0, fat: 0 })).toBe(0);
    expect(caloriesFromMacros({ protein: 150.5, carbs: 200.3, fat: 70.1 })).toBe(Math.round(602 + 801.2 + 630.9));
  });

  it("keeps calories in sync only in automatic mode", () => {
    const targets = { calories: 1000, protein: 100, carbs: 100, fat: 50 };
    expect(withCaloriesMode(targets, "auto")).toMatchObject({ calories: 1250, calories_mode: "auto" });
    expect(withCaloriesMode(targets, "manual")).toMatchObject({ calories: 1000, calories_mode: "manual" });
  });

  it("does not silently switch an old manual number to automatic", () => {
    expect(inferCaloriesMode({ calories: 2200, protein: 150, carbs: 250, fat: 65 })).toBe("manual");
    expect(inferCaloriesMode({ calories: 2185, protein: 150, carbs: 250, fat: 65 })).toBe("auto");
    expect(inferCaloriesMode({ calories: 2000, protein: 150, carbs: 250, fat: 65, calories_mode: "auto" })).toBe("auto");
    expect(inferCaloriesMode(undefined)).toBe("auto");
  });

  it("warns above a 5% difference in manual mode, with the spec's example", () => {
    // 2,900 kcal of macros vs 2,000 entered → 45%, as in the requirement.
    const macros = { protein: 200, carbs: 300, fat: 100 };
    const result = calorieMismatch(2000, macros)!;
    expect(result.computed).toBe(2900);
    expect(Math.round(result.ratio * 100)).toBe(45);
    expect(result.exceeds).toBe(true);
    expect(calorieMismatch(2880, macros)!.exceeds).toBe(false); // < 5%
    expect(calorieMismatch(0, { protein: 0, carbs: 0, fat: 0 })).toBeNull();
  });
});

describe("energy split", () => {
  it("returns whole percentages that always total 100", () => {
    expect(macroSplit({ protein: 150, carbs: 250, fat: 65 })).toEqual({ protein: 27, carbs: 46, fat: 27 });
    for (const sample of [{ protein: 1, carbs: 1, fat: 1 }, { protein: 33.3, carbs: 12.1, fat: 7.7 }, { protein: 0, carbs: 0, fat: 10 }]) {
      const split = macroSplit(sample)!;
      expect(split.protein + split.carbs + split.fat).toBe(100);
    }
    expect(macroSplit({ protein: 0, carbs: 0, fat: 0 })).toBeNull();
  });

  it("reverse mode turns calories and a 40/35/25 split into grams", () => {
    const grams = gramsFromSplit(2000, { protein: 40, carbs: 35, fat: 25 });
    expect(grams).toEqual({ protein: 200, carbs: 175, fat: 55.6 });
    expect(Math.abs(caloriesFromMacros(grams) - 2000)).toBeLessThanOrEqual(1);
    expect(validSplit({ protein: 40, carbs: 35, fat: 25 })).toBe(true);
    expect(validSplit({ protein: 40, carbs: 40, fat: 25 })).toBe(false);
  });
});

describe("validation", () => {
  it("accepts one decimal, rejects negatives, two decimals and out-of-range values", () => {
    expect(macroTargetErrors({ calories: 2000, protein: 150.5, carbs: 200, fat: 60 })).toEqual({});
    expect(macroTargetErrors({ calories: 2000, protein: -1, carbs: 200, fat: 60 }).protein).toBe("القيمة لا تكون سالبة");
    expect(macroTargetErrors({ calories: 2000, protein: 150.25, carbs: 200, fat: 60 }).protein).toContain("عشري واحد");
    expect(macroTargetErrors({ calories: 10001, protein: 1, carbs: 1, fat: 1 }).calories).toContain("10,000");
    expect(macroTargetErrors({ calories: 0, protein: 1001, carbs: 1, fat: 1 }).protein).toContain("1,000");
    expect(macroTargetErrors({ calories: 0, protein: 1000, carbs: 1000, fat: 1000, calories_mode: "auto" }).calories).toBeDefined();
  });

  it("parses Arabic-Indic digits and the Arabic decimal separator", () => {
    expect(parseAmount("١٥٠٫٥")).toBe(150.5);
    expect(parseAmount("150,5")).toBe(150.5);
    expect(parseAmount("")).toBe(0);
    expect(Number.isNaN(parseAmount("abc"))).toBe(true);
  });

  it("server schemas enforce the auto rule and stay tolerant when reading old rows", () => {
    const target = { calories: 2185, protein: 150, carbs: 250, fat: 65, calories_mode: "auto" as const, text: "" };
    expect(recordSchemas.nutrition_target.safeParse(target).success).toBe(true);
    const mismatch = recordSchemas.nutrition_target.safeParse({ ...target, calories: 2000 });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0].message).toContain("لا تطابق");
    expect(recordSchemas.nutrition_target.safeParse({ ...target, calories_mode: "manual", calories: 2000 }).success).toBe(true);
    expect(recordSchemas.nutrition_target.safeParse({ ...target, protein: 150.55 }).success).toBe(false);
    const plan = structuredClone(blankContent);
    plan.nutrition = { ...plan.nutrition, calories: 10, protein: 1, carbs: 0, fat: 0.5, calories_mode: "auto" };
    expect(content.safeParse(plan).success).toBe(false);
    plan.nutrition.calories = 8.5;
    expect(content.safeParse(plan).success).toBe(true);
    // A legacy target saved before the stricter write rule still renders.
    expect(readNutritionTarget({ calories: 2000.25, protein: 150, carbs: 200, fat: 60, text: "" }).calories).toBe(2000.25);
  });
});

describe("meals against the daily target", () => {
  it("shows remaining (+) and over (−) per macro", () => {
    const meals = sumMeals([
      { calories: 500, protein: 40, carbs: 50, fat: 15 },
      { calories: 700.5, protein: 50.5, carbs: 80, fat: 20 },
    ]);
    expect(meals).toEqual({ calories: 1200.5, protein: 90.5, carbs: 130, fat: 35 });
    expect(remainingAgainstTarget({ calories: 2000, protein: 80, carbs: 200, fat: 35 }, meals)).toEqual({ calories: 799.5, protein: -10.5, carbs: 70, fat: 0 });
  });
});

it("uses Arabic plural rules for counts", () => {
  expect(countLabel("ar", 1, nouns.day)).toBe("يوم واحد");
  expect(countLabel("ar", 2, nouns.day)).toBe("يومان");
  expect(countLabel("ar", 3, nouns.day)).toBe("3 أيام");
  expect(countLabel("ar", 11, nouns.day)).toBe("11 يومًا");
  expect(countLabel("ar", 100, nouns.template)).toBe("100 قالب");
  expect(countLabel("en", 2, nouns.template)).toBe("2 templates");
});

describe("database rules", () => {
  let fixture: Awaited<ReturnType<typeof fixtureDatabase>>;
  beforeAll(async () => {
    fixture = await fixtureDatabase();
  });
  afterAll(async () => fixture?.db.close());
  const today = riyadhToday();
  const save = (clientId: string, payload: unknown) =>
    fixture.manage(coach, "record_save", { id: randomUUID(), client_id: clientId, kind: "nutrition_target", entry_date: today, payload });

  it("stores the calories mode with the nutrition target", async () => {
    const id = await fixture.client();
    const saved = await save(id, { calories: 2185, protein: 150, carbs: 250, fat: 65, calories_mode: "auto", text: "" });
    expect((saved as { payload: { calories_mode: string } }).payload.calories_mode).toBe("auto");
    await expect(save(id, { calories: 2000, protein: 150, carbs: 250, fat: 65, calories_mode: "manual", text: "" })).resolves.toBeTruthy();
  });

  it("rejects automatic targets whose calories do not match, and unknown modes", async () => {
    const id = await fixture.client();
    await expect(save(id, { calories: 2000, protein: 150, carbs: 250, fat: 65, calories_mode: "auto", text: "" })).rejects.toThrow();
    await expect(save(id, { calories: 2185, protein: 150, carbs: 250, fat: 65, calories_mode: "smart", text: "" })).rejects.toThrow();
  });

  it("accepts the mode inside program and template content, and validates it", async () => {
    const id = await fixture.client();
    const plan = structuredClone(blankContent);
    plan.nutrition = { ...plan.nutrition, calories: 2185, protein: 150, carbs: 250, fat: 65, calories_mode: "auto" };
    await expect(fixture.app(coach, "program_save", { client_id: id, name: "برنامج اختباري", content: plan })).resolves.toBeTruthy();
    await expect(
      fixture.app(coach, "template_save", { name: `قالب ${randomUUID().slice(0, 6)}`, content: { ...plan, nutrition: { ...plan.nutrition, calories: 1500 } } }),
    ).rejects.toThrow();
  });
});
