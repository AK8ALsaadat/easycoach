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
    const notices = new Map<Field, { node: HTMLParagraphElement; original: string | null; invalid: string | null }>();
    let counter = 0;
    const clear = (field: Field) => {
      const entry = notices.get(field);
      if (!entry) return;
      const tokens = (field.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(token => token && token !== entry.node.id);
      if (tokens.length) field.setAttribute("aria-describedby", tokens.join(" "));
      else field.removeAttribute("aria-describedby");
      if (entry.invalid !== null) field.setAttribute("aria-invalid", entry.invalid);
      else field.removeAttribute("aria-invalid");
      entry.node.remove();
      notices.delete(field);
    };
    const validate = (field: Field) => {
      if (!field.willValidate) return clear(field);
      if (field.validity.customError && !field.dataset[FLAG]) return;
      field.setCustomValidity("");
      delete field.dataset[FLAG];
      const text = message(field, document.documentElement.lang === "en");
      if (!text) return clear(field);
      field.setCustomValidity(text);
      field.dataset[FLAG] = "1";
      let entry = notices.get(field);
      if (!entry) {
        const node = document.createElement("p");
        node.id = `ec-inline-error-${++counter}`;
        node.className = "field-error";
        node.setAttribute("aria-live", "polite");
        entry = { node, original: field.getAttribute("aria-describedby"), invalid: field.getAttribute("aria-invalid") };
        notices.set(field, entry);
        // Keep React-owned wrappers (password reveal, date controls) intact.
        const anchor = field.closest(".password-field") ?? field;
        anchor.insertAdjacentElement("afterend", node);
        field.setAttribute("aria-describedby", [entry.original, node.id].filter(Boolean).join(" "));
      }
      entry.node.textContent = text;
      field.setAttribute("aria-invalid", "true");
    };
    const isField = (target: EventTarget | null): target is Field => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    const onInvalid = (event: Event) => {
      if (isField(event.target)) validate(event.target);
    };
    const onEdit = (event: Event) => {
      if (isField(event.target) && notices.has(event.target)) validate(event.target);
    };
    const onBlur = (event: Event) => { if (isField(event.target)) validate(event.target); };
    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("focusout", onBlur, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("focusout", onBlur, true);
      for (const field of notices.keys()) clear(field);
    };
  }, []);
  return null;
}
