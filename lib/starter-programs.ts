import { blankContent, type Content } from "./model";

/** Editable drafts. Creating a template never assigns or publishes it to a trainee. */
export const starterPrograms = [
  { key: "full-body", name: "تأسيس الجسم كاملًا", description: "٣ أيام قابلة للتوزيع على الأسبوع", days: [
    { name: "الجسم كاملًا · أ", exercises: ["سكوات بوزن الجسم", "ضغط", "تجديف بالدمبل", "بلانك"] },
    { name: "الجسم كاملًا · ب", exercises: ["اندفاع خلفي", "ضغط كتف بالدمبل", "سحب أمامي", "جسر الحوض"] },
    { name: "الجسم كاملًا · ج", exercises: ["سكوات بوزن الجسم", "بنش برس بالدمبل", "تجديف بالدمبل", "رفع السمانة"] },
  ] },
  { key: "upper-lower", name: "علوي وسفلي", description: "٤ أيام بتنظيم منفصل للجزء العلوي والسفلي", days: [
    { name: "علوي · أ", exercises: ["بنش برس بالدمبل", "تجديف بالدمبل", "رفع جانبي بالدمبل", "بايسبس بالدمبل"] },
    { name: "سفلي · أ", exercises: ["سكوات بوزن الجسم", "اندفاع خلفي", "جسر الحوض", "رفع السمانة"] },
    { name: "علوي · ب", exercises: ["ضغط كتف بالدمبل", "سحب أمامي", "ضغط", "ترايسبس بالكيبل"] },
    { name: "سفلي · ب", exercises: ["اندفاع خلفي", "جسر الحوض", "ثني الرجل بالجهاز", "رفع السمانة"] },
  ] },
] as const;

export function starterContent(key: string): Content {
  const program = starterPrograms.find(item => item.key === key);
  if (!program) throw new Error("القالب غير متاح");
  return { ...structuredClone(blankContent), days: program.days.map(day => ({ name: day.name, exercises: day.exercises.map(name => ({ name, description: "", video: "", sets: 3, reps: "10–12", rest: 90, rowId: crypto.randomUUID() })) })) };
}
