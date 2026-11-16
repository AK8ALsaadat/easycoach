import data from "./exercise-data/exercises.json";
import { exerciseName } from "./exercise-names";
export const muscles: Record<string, string> = {
  abdominals: "البطن",
  hamstrings: "خلفية الفخذ",
  adductors: "الفخذ الداخلي",
  quadriceps: "أمامية الفخذ",
  biceps: "بايسبس",
  shoulders: "الأكتاف",
  chest: "الصدر",
  "middle back": "منتصف الظهر",
  calves: "السمانة",
  glutes: "المؤخرة",
  "lower back": "أسفل الظهر",
  lats: "الظهر العريض",
  triceps: "ترايسبس",
  traps: "الترابيس",
  forearms: "الساعد",
  neck: "الرقبة",
  abductors: "الفخذ الخارجي",
};
export const equipment: Record<string, string> = {
  "body only": "وزن الجسم",
  barbell: "بار",
  dumbbell: "دمبل",
  cable: "كيبل",
  machine: "جهاز",
  kettlebells: "كيتل بيل",
  bands: "مطاط",
  "exercise ball": "كرة رياضية",
  "medicine ball": "كرة طبية",
  "e-z curl bar": "بار EZ",
  other: "أخرى",
  "foam roll": "فوم رول",
};
export type CatalogExercise = (typeof data)[number];
export const catalog = data;
export const catalogById = new Map(data.map((e) => [e.id, e]));
export { exerciseName } from "./exercise-names";
/**
 * A coach-written exercise shown inside the guide and the search beside the
 * 876 built-in movements. It keeps its own instructions, link and uploaded
 * clip so that picking it carries all three into the program.
 */
export type CustomCatalogExercise = CatalogExercise & {
  custom: { exerciseId: string; description: string; video: string; mediaId: string | null };
};
export type PickerExercise = CatalogExercise | CustomCatalogExercise;
export const isCustomExercise = (exercise: PickerExercise): exercise is CustomCatalogExercise =>
  "custom" in exercise && Boolean(exercise.custom);

/** Presents the coach library in the shape the guide and picker already use. */
export function customCatalogEntries(
  exercises: { id: string; name: string; description: string; video: string; media_id?: string | null }[],
): CustomCatalogExercise[] {
  return exercises.map((exercise) => ({
    id: "custom:" + exercise.id,
    name: exercise.name,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: "",
    level: "beginner",
    category: "strength",
    images: [],
    custom: {
      exerciseId: exercise.id,
      description: exercise.description,
      video: exercise.video,
      mediaId: exercise.media_id ?? null,
    },
  }));
}

export function catalogSearch(e: CatalogExercise, query: string) {
  const terms: Record<string, string> = {
    سكوات: "squat",
    بنش: "bench",
    ديدلفت: "deadlift",
    لانجز: "lunge",
    هامر: "hammer",
    بلانك: "plank",
    كرنش: "crunch",
    هيب: "hip",
    فيس: "face",
    سميث: "smith",
  };
  const text = [
    e.name,
    exerciseName(e),
    ...e.primaryMuscles.map((m) => muscles[m]),
    equipment[e.equipment ?? ""] ?? "",
    e.id,
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((q) => text.includes(q) || text.includes(terms[q] ?? "\u0000"));
}

/** Rank the exercise name before incidental matches in muscle/equipment labels. */
export function catalogSearchRank(e: CatalogExercise, query: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/\s+/g, " ").trim();
  const q = normalize(query);
  if (!q) return 0;
  const names = [normalize(e.name), normalize(exerciseName(e))];
  if (names.includes(q)) return 100;
  if (names.some(name => name.startsWith(q))) return 80;
  if (names.some(name => name.includes(q))) return 60;
  if (names.some(name => q.split(" ").every(term => name.includes(term)))) return 40;
  return 0;
}
