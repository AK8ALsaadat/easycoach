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
  exercise: { ar: { zero: "{n} تمارين", one: "تمرين واحد", two: "تمرينان", few: "{n} تمارين", many: "{n} تمرينًا", other: "{n} تمرين" }, en: ["exercise", "exercises"] },
  calorie: { ar: { zero: "{n} سعرة", one: "سعرة واحدة", two: "سعرتان", few: "{n} سعرات", many: "{n} سعرة", other: "{n} سعرة" }, en: ["kcal", "kcal"] },
  program: { ar: { zero: "لا توجد برامج", one: "برنامج واحد", two: "برنامجان", few: "{n} برامج", many: "{n} برنامجًا", other: "{n} برنامج" }, en: ["program", "programs"] },
  weight: { ar: { zero: "لا توجد أوزان", one: "وزن واحد", two: "وزنان", few: "{n} أوزان", many: "{n} وزنًا", other: "{n} وزن" }, en: ["weight entry", "weight entries"] },
  photo: { ar: { zero: "لا توجد صور", one: "صورة واحدة", two: "صورتان", few: "{n} صور", many: "{n} صورة", other: "{n} صورة" }, en: ["photo", "photos"] },
  message: { ar: { zero: "لا توجد رسائل", one: "رسالة واحدة", two: "رسالتان", few: "{n} رسائل", many: "{n} رسالة", other: "{n} رسالة" }, en: ["message", "messages"] },
  subscription: { ar: { zero: "لا توجد اشتراكات", one: "اشتراك واحد", two: "اشتراكان", few: "{n} اشتراكات", many: "{n} اشتراكًا", other: "{n} اشتراك" }, en: ["subscription", "subscriptions"] },
  trainee: { ar: { zero: "لا يوجد متدربون", one: "متدرب واحد", two: "متدربان", few: "{n} متدربين", many: "{n} متدربًا", other: "{n} متدرب" }, en: ["trainee", "trainees"] },
} satisfies Record<string, Noun>;

/** Saudi riyal amounts with Western digits, matching the rest of the interface. */
export function formatSar(value: number | string, language: Language = "ar") {
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value));
  return language === "en" ? `SAR ${amount}` : `${amount} ر.س`;
}
