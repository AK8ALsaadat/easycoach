// Shared macro arithmetic for the coach editors, the trainee view, the server
// schemas and tests. Grams accept one decimal place; calories are whole kcal.
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;
export const MACRO_LIMITS = { calories: 10000, grams: 1000 } as const;
/** Manual calories differing from the macro total by more than this share warn the coach. */
export const CALORIE_MISMATCH_RATIO = 0.05;

export type CaloriesMode = "auto" | "manual";
export type Macros = { protein: number; carbs: number; fat: number };
export type MacroTargets = Macros & { calories: number; calories_mode?: CaloriesMode };
export type MacroSplit = { protein: number; carbs: number; fat: number };

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Exact (unrounded) energy from grams; use for comparisons and validation. */
export function exactCaloriesFromMacros({ protein, carbs, fat }: Macros) {
  return protein * KCAL_PER_GRAM.protein + carbs * KCAL_PER_GRAM.carbs + fat * KCAL_PER_GRAM.fat;
}

/** Calories = protein×4 + carbs×4 + fat×9, rounded to whole kcal. */
export function caloriesFromMacros(macros: Macros) {
  return Math.round(exactCaloriesFromMacros(macros));
}

/** True when a number has at most one decimal place (e.g. 150 or 150.5). */
export function hasOneDecimal(value: number) {
  return Number.isFinite(value) && Math.abs(value * 10 - Math.round(value * 10)) < 1e-6;
}

/**
 * Relative difference between manual calories and the macro total.
 * Returns null when both are zero (nothing to compare yet).
 */
export function calorieMismatch(calories: number, macros: Macros) {
  const computed = caloriesFromMacros(macros);
  if (computed === 0 && calories === 0) return null;
  // Relative to what the coach typed: 2,900 computed vs 2,000 entered is a 45% gap.
  const base = calories || computed;
  const ratio = Math.abs(calories - computed) / base;
  return { computed, entered: calories, ratio, exceeds: ratio > CALORIE_MISMATCH_RATIO };
}

/**
 * Energy share of each macro, as whole percentages that add up to 100.
 * Uses largest-remainder rounding so the bar never shows 99% or 101%.
 */
export function macroSplit(macros: Macros): MacroSplit | null {
  const parts = {
    protein: macros.protein * KCAL_PER_GRAM.protein,
    carbs: macros.carbs * KCAL_PER_GRAM.carbs,
    fat: macros.fat * KCAL_PER_GRAM.fat,
  };
  const total = parts.protein + parts.carbs + parts.fat;
  if (!(total > 0)) return null;
  const keys = ["protein", "carbs", "fat"] as const;
  const raw = keys.map((key) => (parts[key] / total) * 100);
  const floors = raw.map(Math.floor);
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index]++;
    remainder--;
  }
  return { protein: floors[0], carbs: floors[1], fat: floors[2] };
}

/** Validates a percentage split such as 40/35/25 (whole or one-decimal values that sum to 100). */
export function validSplit(split: MacroSplit) {
  const values = [split.protein, split.carbs, split.fat];
  return values.every((v) => v >= 0 && v <= 100 && hasOneDecimal(v)) &&
    Math.abs(values.reduce((sum, v) => sum + v, 0) - 100) < 0.01;
}

/** Reverse mode: calories + percentage split → grams (one decimal place). */
export function gramsFromSplit(calories: number, split: MacroSplit): Macros {
  return {
    protein: round1((calories * split.protein) / 100 / KCAL_PER_GRAM.protein),
    carbs: round1((calories * split.carbs) / 100 / KCAL_PER_GRAM.carbs),
    fat: round1((calories * split.fat) / 100 / KCAL_PER_GRAM.fat),
  };
}

/** Applies the auto rule: in auto mode calories always follow the macros. */
export function withCaloriesMode<T extends MacroTargets>(targets: T, mode: CaloriesMode): T {
  return mode === "auto"
    ? { ...targets, calories_mode: mode, calories: caloriesFromMacros(targets) }
    : { ...targets, calories_mode: mode };
}

/**
 * Stored targets without a mode predate the toggle. Treat them as automatic only
 * when their calories already match the macros, so opening an old plan never
 * silently rewrites a coach's manual number.
 */
export function inferCaloriesMode(targets: Partial<MacroTargets> | undefined): CaloriesMode {
  if (targets?.calories_mode) return targets.calories_mode;
  if (!targets) return "auto";
  const macros = { protein: targets.protein ?? 0, carbs: targets.carbs ?? 0, fat: targets.fat ?? 0 };
  const calories = targets.calories ?? 0;
  if (calories === 0 && caloriesFromMacros(macros) === 0) return "auto";
  return Math.abs(calories - exactCaloriesFromMacros(macros)) < 1 ? "auto" : "manual";
}

/** Parses typed numbers, accepting Arabic-Indic digits and the Arabic decimal separator. */
export function parseAmount(text: string) {
  const normalized = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, ".");
  if (normalized === "") return 0;
  return /^-?\d*\.?\d*$/.test(normalized) && normalized !== "." && normalized !== "-" ? Number(normalized) : Number.NaN;
}
/** Arabic validation message for one amount, or null when valid. */
export function amountError(value: number, max: number) {
  if (!Number.isFinite(value)) return "اكتب رقمًا صالحًا";
  if (value < 0) return "القيمة لا تكون سالبة";
  if (value > max) return `الحد الأعلى ${max.toLocaleString("en-US")}`;
  if (!hasOneDecimal(value)) return "يُقبل رقم عشري واحد فقط بعد الفاصلة";
  return null;
}
export function macroTargetErrors(targets: MacroTargets) {
  const errors: Partial<Record<keyof Macros | "calories", string>> = {};
  for (const key of ["protein", "carbs", "fat"] as const) {
    const error = amountError(targets[key], MACRO_LIMITS.grams);
    if (error) errors[key] = error;
  }
  const calories = amountError(targets.calories, MACRO_LIMITS.calories);
  if (calories) errors.calories = calories;
  else if (targets.calories_mode === "auto" && exactCaloriesFromMacros(targets) > MACRO_LIMITS.calories)
    errors.calories = "مجموع الماكروز يتجاوز 10,000 سعرة";
  return errors;
}

export type MealTotals = { calories: number; protein: number; carbs: number; fat: number };
export function sumMeals(meals: MealTotals[] = []): MealTotals {
  const total = meals.reduce(
    (sum, meal) => ({
      calories: sum.calories + meal.calories,
      protein: sum.protein + meal.protein,
      carbs: sum.carbs + meal.carbs,
      fat: sum.fat + meal.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return {
    calories: Math.round(total.calories * 10) / 10,
    protein: round1(total.protein),
    carbs: round1(total.carbs),
    fat: round1(total.fat),
  };
}

/** Positive = remaining against the daily target, negative = over the target. */
export function remainingAgainstTarget(target: MealTotals, meals: MealTotals): MealTotals {
  return {
    calories: Math.round((target.calories - meals.calories) * 10) / 10,
    protein: round1(target.protein - meals.protein),
    carbs: round1(target.carbs - meals.carbs),
    fat: round1(target.fat - meals.fat),
  };
}
