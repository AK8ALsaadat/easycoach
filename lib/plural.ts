import type { Language } from "./i18n";

type Rule = "zero" | "one" | "two" | "few" | "many" | "other";
/** Arabic forms; `{n}` is replaced by the formatted number. */
export type ArabicForms = Partial<Record<Rule, string>> & { other: string };
export type Noun = { ar: ArabicForms; en: [singular: string, plural: string] };

const arabicRules = new Intl.PluralRules("ar");
const numbers = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
export const formatNumber = (value: number) => numbers.format(value);

export function pluralAr(count: number, forms: ArabicForms) {
  const rule = arabicRules.select(count) as Rule;
  return (forms[rule] ?? forms.other).replace("{n}", formatNumber(count));
}
export function countLabel(language: Language, count: number, noun: Noun) {
  if (language === "en") return `${formatNumber(count)} ${count === 1 ? noun.en[0] : noun.en[1]}`;
  return pluralAr(count, noun.ar);
}

// Integers use the full Arabic agreement rules; fractional values fall under "other".
export const nouns = {
  day: { ar: { zero: "{n} أيام", one: "يوم واحد", two: "يومان", few: "{n} أيام", many: "{n} يومًا", other: "{n} يوم" }, en: ["day", "days"] },
  template: { ar: { zero: "لا توجد قوالب", one: "قالب واحد", two: "قالبان", few: "{n} قوالب", many: "{n} قالبًا", other: "{n} قالب" }, en: ["template", "templates"] },
  exercise: { ar: { zero: "بدون تمارين", one: "تمرين واحد", two: "تمرينان", few: "{n} تمارين", many: "{n} تمرينًا", other: "{n} تمرين" }, en: ["exercise", "exercises"] },
  calorie: { ar: { zero: "{n} سعرة", one: "سعرة واحدة", two: "سعرتان", few: "{n} سعرات", many: "{n} سعرة", other: "{n} سعرة" }, en: ["kcal", "kcal"] },
  program: { ar: { zero: "لا توجد برامج", one: "برنامج واحد", two: "برنامجان", few: "{n} برامج", many: "{n} برنامجًا", other: "{n} برنامج" }, en: ["program", "programs"] },
  weight: { ar: { zero: "لا توجد أوزان", one: "وزن واحد", two: "وزنان", few: "{n} أوزان", many: "{n} وزنًا", other: "{n} وزن" }, en: ["weight entry", "weight entries"] },
  photo: { ar: { zero: "لا توجد صور", one: "صورة واحدة", two: "صورتان", few: "{n} صور", many: "{n} صورة", other: "{n} صورة" }, en: ["photo", "photos"] },
  message: { ar: { zero: "لا توجد رسائل", one: "رسالة واحدة", two: "رسالتان", few: "{n} رسائل", many: "{n} رسالة", other: "{n} رسالة" }, en: ["message", "messages"] },
  subscription: { ar: { zero: "لا توجد اشتراكات", one: "اشتراك واحد", two: "اشتراكان", few: "{n} اشتراكات", many: "{n} اشتراكًا", other: "{n} اشتراك" }, en: ["subscription", "subscriptions"] },
  movement: { ar: { zero: "بدون حركات", one: "حركة واحدة", two: "حركتان", few: "{n} حركات", many: "{n} حركة", other: "{n} حركة" }, en: ["movement", "movements"] },
  round: { ar: { zero: "بدون جولات", one: "جولة واحدة", two: "جولتان", few: "{n} جولات", many: "{n} جولة", other: "{n} جولة" }, en: ["round", "rounds"] },
  set: { ar: { zero: "بدون مجموعات", one: "مجموعة واحدة", two: "مجموعتان", few: "{n} مجموعات", many: "{n} مجموعة", other: "{n} مجموعة" }, en: ["set", "sets"] },
  entry: { ar: { zero: "بدون تسجيلات", one: "تسجيل واحد", two: "تسجيلان", few: "{n} تسجيلات", many: "{n} تسجيلًا", other: "{n} تسجيل" }, en: ["entry", "entries"] },
  meal: { ar: { zero: "بدون وجبات", one: "وجبة واحدة", two: "وجبتان", few: "{n} وجبات", many: "{n} وجبة", other: "{n} وجبة" }, en: ["meal", "meals"] },
  trainingDay: { ar: { zero: "بدون أيام تدريب", one: "يوم تدريبي واحد", two: "يومان تدريبيان", few: "{n} أيام تدريبية", many: "{n} يومًا تدريبيًا", other: "{n} يوم تدريبي" }, en: ["training day", "training days"] },
  activeSubscription: { ar: { zero: "لا توجد اشتراكات نشطة", one: "اشتراك نشط واحد", two: "اشتراكان نشطان", few: "{n} اشتراكات نشطة", many: "{n} اشتراكًا نشطًا", other: "{n} اشتراك نشط" }, en: ["active subscription", "active subscriptions"] },
  copy: { ar: { zero: "بدون نسخ", one: "نسخة مستقلة واحدة", two: "نسختان مستقلتان", few: "{n} نسخ مستقلة", many: "{n} نسخة مستقلة", other: "{n} نسخة مستقلة" }, en: ["independent copy", "independent copies"] },
  row: { ar: { zero: "بدون صفوف", one: "صف واحد", two: "صفان", few: "{n} صفوف", many: "{n} صفًا", other: "{n} صف" }, en: ["row", "rows"] },
  issue: { ar: { zero: "لا توجد ملاحظات", one: "ملاحظة واحدة", two: "ملاحظتان", few: "{n} ملاحظات", many: "{n} ملاحظة", other: "{n} ملاحظة" }, en: ["issue", "issues"] },
  trainee: { ar: { zero: "لا يوجد متدربون", one: "متدرب واحد", two: "متدربان", few: "{n} متدربين", many: "{n} متدربًا", other: "{n} متدرب" }, en: ["trainee", "trainees"] },
} satisfies Record<string, Noun>;

/** Saudi riyal amounts with Western digits, matching the rest of the interface. */
export function formatSar(value: number | string, language: Language = "ar") {
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value));
  return language === "en" ? `SAR ${amount}` : `${amount} ر.س`;
}

/** "متبقي يوم واحد" / "متبقي يومان" / "متبقي 3 أيام" / "ينتهي اليوم". */
export function daysLeft(language: Language, days: number) {
  if (days === 0) return language === "en" ? "Ends today" : "ينتهي اليوم";
  if (days < 0) return language === "en" ? "Ended" : "منتهٍ";
  return language === "en" ? `${countLabel(language, days, nouns.day)} left` : `متبقي ${countLabel(language, days, nouns.day)}`;
}
/** Genitive after "آخر": "آخر تسجيل" / "آخر تسجيلين" / "آخر 7 تسجيلات". */
export function lastEntries(language: Language, count: number) {
  if (language === "en") return count === 1 ? "last entry" : `last ${formatNumber(count)} entries`;
  return pluralAr(count, { one: "آخر تسجيل", two: "آخر تسجيلين", few: "آخر {n} تسجيلات", many: "آخر {n} تسجيلًا", other: "آخر {n} تسجيل" });
}
/** "+1.5" / "-0.5" / "0"; render inside <bdi dir="ltr"> so the sign stays on the left in RTL. */
export function formatSigned(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${formatNumber(Math.abs(rounded))}`;
}
