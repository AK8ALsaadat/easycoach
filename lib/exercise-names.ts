import arabic from "./exercise-data/ar.json";

export type ExerciseIdentity = { id: string; name: string };

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
type Translation = { name: string };
const translations: Record<string, Translation> = arabic;
export const exerciseName = (
  e: ExerciseIdentity,
  language: "ar" | "en" = "ar",
) =>
  language === "en"
    ? e.name
    : (translations[e.id]?.name ?? aliases[e.name] ?? e.name);
