import data from "./exercise-data/exercises.json";
import arabic from "./exercise-data/ar.json";
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
const aliases: Record<string, string> = {
  "Barbell Bench Press - Medium Grip": "بنش برس بالبار",
  "Barbell Squat": "سكوات بالبار",
  "Barbell Deadlift": "ديدلفت بالبار",
  Pullups: "عقلة",
  Pushups: "ضغط",
  "Dumbbell Bench Press": "بنش برس بالدمبل",
  "Incline Dumbbell Press": "ضغط دمبل مائل",
  "Dumbbell Shoulder Press": "ضغط كتف دمبل",
  "Side Lateral Raise": "رفرفة جانبية",
  "Lat Pulldown": "سحب علوي",
  "Wide-Grip Lat Pulldown": "سحب علوي واسع",
  "Seated Cable Rows": "سحب كيبل أرضي",
  "Leg Press": "دفع الأرجل",
  "Leg Extensions": "تمديد الأرجل",
  "Lying Leg Curls": "ثني الأرجل",
  "Romanian Deadlift": "ديدلفت روماني",
  "Barbell Curl": "بايسبس بالبار",
  "Dumbbell Bicep Curl": "بايسبس دمبل",
  "Hammer Curls": "هامر دمبل",
  "Triceps Pushdown": "ترايسبس كيبل",
  Plank: "بلانك",
  Crunches: "كرنش",
  "Standing Calf Raises": "سمانة واقف",
  "Hip Thrust": "دفع الحوض",
  "Face Pull": "سحب الوجه",
  "Bulgarian Split Squat": "سكوات بلغاري",
  "Walking, Treadmill": "مشي على السير",
};
export type CatalogExercise = (typeof data)[number];
export const catalog = data;
export const catalogById = new Map(data.map((e) => [e.id, e]));
type Translation = { name: string };
const translations: Record<string, Translation> = arabic;
export const exerciseName = (
  e: CatalogExercise,
  language: "ar" | "en" = "ar",
) =>
  language === "en"
    ? e.name
    : (translations[e.id]?.name ?? aliases[e.name] ?? e.name);
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
