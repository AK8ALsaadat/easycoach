/**
 * Training-table input rules shared by the editor (live feedback) and the server
 * (zod schema in lib/model.ts). Values arrive as typed text so "abc" or "-5" are
 * rejected instead of being coerced ("-5" must never become "05").
 */
import type { Content } from "./model";

export const DEFAULT_EXERCISE_NAME = "تمرين جديد";
export const SETS_ERROR = "المجموعات عدد صحيح من 1 إلى 20";
export const REPS_ERROR = "التكرارات رقم أو مدى مثل 8-12";
export const REST_ERROR = "الراحة من 0 إلى 600 ثانية";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const asciiDigits = (value: string) =>
  value.replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));

type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

function wholeNumber(raw: string, min: number, max: number, error: string): Parsed<number> {
  const text = asciiDigits(raw).trim();
  if (!/^\d{1,3}$/.test(text)) return { error };
  const value = Number(text);
  return value >= min && value <= max ? { value } : { error };
}
export const parseSets = (raw: string) => wholeNumber(raw, 1, 20, SETS_ERROR);
export const parseRest = (raw: string) => wholeNumber(raw, 0, 600, REST_ERROR);

const REPS = /^(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?$/;
/** "10" or a range "8-12" (stored with an en dash, "8–12"). */
export function parseReps(raw: string): Parsed<string> {
  const match = REPS.exec(asciiDigits(raw).trim());
  if (!match) return { error: REPS_ERROR };
  const low = Number(match[1]);
  if (low < 1 || low > 100) return { error: REPS_ERROR };
  if (match[2] === undefined) return { value: String(low) };
  const high = Number(match[2]);
  if (high <= low || high > 100) return { error: REPS_ERROR };
  return { value: `${low}–${high}` };
}
export const validReps = (value: string) => parseReps(value).value !== undefined;

export type PublishIssue = {
  key: string;
  kind: "exercise" | "meal" | "day";
  /** Day index for exercises. */
  day?: number;
  /** Exercise row or meal index. */
  index: number;
  message: string;
};

type Meal = NonNullable<Content["nutrition"]["meals"]>[number];
/** A placeholder meal: nothing described and every value zero. */
export const emptyMeal = (meal: Meal) =>
  !meal.foods.trim() && [meal.calories, meal.protein, meal.carbs, meal.fat].every((value) => !Number(value));

/** Problems that block publishing a program to the trainee. */
export function publishIssues(content: Content): PublishIssue[] {
  const issues: PublishIssue[] = [];
  // An empty day is fine in a draft and never fine in a published program.
  content.days.forEach((day, dayIndex) => {
    if (!day.exercises.length)
      issues.push({ key: `day-${dayIndex}`, kind: "day", day: dayIndex, index: 0, message: `${day.name}: ما فيه أي تمرين. أضف تمرينًا أو احذف اليوم` });
  });
  content.days.forEach((day, dayIndex) =>
    day.exercises.forEach((exercise, index) => {
      if (exercise.name.trim() === DEFAULT_EXERCISE_NAME)
        issues.push({ key: `ex-${dayIndex}-${index}`, kind: "exercise", day: dayIndex, index, message: `${day.name}: التمرين ${index + 1} ما زال باسم «${DEFAULT_EXERCISE_NAME}»` });
    }),
  );
  (content.nutrition.meals ?? []).forEach((meal, index) => {
    if (emptyMeal(meal))
      issues.push({ key: `meal-${index}`, kind: "meal", index, message: `${meal.name}: الوجبة فارغة وكل قيمها صفر` });
  });
  return issues;
}
