import type { ZodError } from "zod";
import { traineeTerms } from "./terms";

/** Arabic labels for schema fields; never show raw keys such as "phone:". */
const LABELS: Record<string, string> = {
  name: "الاسم", email: "الإيميل", phone: "الجوال", price: "قيمة الاشتراك", amount: "المبلغ",
  start_date: "تاريخ البداية", end_date: "تاريخ النهاية", paid_date: "تاريخ الدفع", entry_date: "التاريخ",
  reference: "المرجع", method: "طريقة الدفع", weight: "الوزن", target_weight: "الوزن المستهدف",
  goal: "الهدف", focus: "التركيز", notes: "الملاحظات", content: "البرنامج", reason: "السبب",
  sets: "المجموعات", reps: "التكرارات", rest: "الراحة", calories: "السعرات", protein: "البروتين",
  carbs: "الكارب", fat: "الدهون", days: "الأيام", exercises: "التمارين", meals: "الوجبات", text: "النص",
};
const isArabic = (text: string) => /[؀-ۿ]/.test(text);

/** One readable Arabic line from schema issues (field label + Arabic message). */
export function arabicIssues(error: ZodError, limit = 3) {
  const lines = error.issues.slice(0, limit).map((issue) => {
    const key = [...issue.path].reverse().find((part) => typeof part === "string" && LABELS[part]) as string | undefined;
    const label = key ? LABELS[key] : "";
    const message = isArabic(issue.message) ? traineeTerms(issue.message) : "قيمة غير صالحة";
    // Messages that already name the field (e.g. "المجموعات عدد صحيح…") need no prefix.
    return label && !message.includes(label) ? `${label}: ${message}` : message;
  });
  return [...new Set(lines)].join(" · ") || "تحقق من البيانات المدخلة وحاول مرة أخرى.";
}
