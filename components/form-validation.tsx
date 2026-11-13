"use client";
import { useEffect } from "react";

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const FLAG = "ecValidity";

function message(field: Field, english: boolean) {
  const v = field.validity;
  const input = field as HTMLInputElement;
  const label = (field.getAttribute("aria-label") || field.labels?.[0]?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (v.valueMissing) {
    if (field instanceof HTMLSelectElement) return english ? "Choose an option." : "اختر قيمة من القائمة.";
    if (input.type === "checkbox") return english ? "Tick this box to continue." : "حدّد هذا الخيار للمتابعة.";
    if (input.type === "file") return english ? "Choose a file." : "اختر ملفًا.";
    return english ? "This field is required." : label ? `أدخل ${label}.` : "هذا الحقل مطلوب.";
  }
  if (v.typeMismatch) {
    if (input.type === "email") return english ? "Enter a valid email, like name@example.com." : "أدخل إيميلًا صحيحًا مثل name@example.com.";
    if (input.type === "url") return english ? "Enter a link that starts with https://." : "أدخل رابطًا صحيحًا يبدأ بـ https://.";
    return english ? "Enter a valid value." : "أدخل قيمة صحيحة.";
  }
  if (v.badInput) return english ? "Enter a valid number." : "أدخل رقمًا صحيحًا.";
  if (v.rangeUnderflow) return english ? `Value must be at least ${input.min}.` : `القيمة يجب ألا تقل عن ${input.min}.`;
  if (v.rangeOverflow) return english ? `Value must be at most ${input.max}.` : `القيمة يجب ألا تزيد على ${input.max}.`;
  if (v.stepMismatch) return english ? "Enter a value with fewer decimal places." : "أدخل رقمًا بمنازل عشرية أقل.";
  if (v.tooShort) return english ? `Use at least ${input.minLength} characters.` : `أدخل ${input.minLength} أحرف على الأقل.`;
  if (v.tooLong) return english ? `Use at most ${input.maxLength} characters.` : `الحد الأقصى ${input.maxLength} حرفًا.`;
  if (v.patternMismatch) return field.title || (english ? "Check the format." : "تحقق من صيغة القيمة.");
  return "";
}

/**
 * Replaces the browser's built-in validation bubbles ("Please fill out this field",
 * "Value must be less than or equal to 400"…) with Arabic (or English) messages for
 * every form in the app. Messages an app sets itself (setCustomValidity) are kept.
 */
export function FormValidation() {
  useEffect(() => {
    const onInvalid = (event: Event) => {
      const field = event.target as Field;
      if (!("validity" in field)) return;
      if (field.validity.customError && !field.dataset[FLAG]) return;
      const english = document.documentElement.lang === "en";
      field.setCustomValidity("");
      const text = message(field, english);
      if (!text) return;
      field.setCustomValidity(text);
      field.dataset[FLAG] = "1";
    };
    const onEdit = (event: Event) => {
      const field = event.target as Field;
      if (field?.dataset?.[FLAG]) {
        field.setCustomValidity("");
        delete field.dataset[FLAG];
      }
    };
    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
    };
  }, []);
  return null;
}
