import { z } from "zod";

// Mirrors the database rules in 20261113110000_template_names.sql.
export const TEMPLATE_NAME_MIN = 2;
export const TEMPLATE_NAME_MAX = 60;
export const normalizeTemplateName = (name: string) => name.trim().replace(/\s+/g, " ");
export const templateNameKey = (name: string) => normalizeTemplateName(name).toLowerCase();
/** Placeholder names left by the old flow, including numbered copies of them. */
export const isUnnamedTemplate = (name: string) => /^(قالب جديد|مسودة جديدة)( ?(·|\().*)?$/.test(templateNameKey(name));

export function templateNameError(name: string, existing: { id: string; name: string }[] = [], selfId?: string) {
  const clean = normalizeTemplateName(name);
  if (!clean) return "اكتب اسم القالب";
  if (clean.length < TEMPLATE_NAME_MIN || clean.length > TEMPLATE_NAME_MAX) return "اسم القالب لازم يكون من 2 إلى 60 حرفًا";
  if (isUnnamedTemplate(clean)) return "اختر اسمًا واضحًا للقالب بدل «قالب جديد» أو «مسودة جديدة»";
  const key = templateNameKey(clean);
  if (existing.some((t) => t.id !== selfId && templateNameKey(t.name) === key)) return "عندك قالب بنفس الاسم";
  return null;
}

/** "اسم القالب (نسخة)", then "(نسخة 2)", "(نسخة 3)"… within the length limit. */
export function suggestCopyName(base: string, existing: { name: string }[]) {
  const root = normalizeTemplateName(base).replace(/\s*\(نسخة( \d+)?\)$/, "");
  const taken = new Set(existing.map((t) => templateNameKey(t.name)));
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? " (نسخة)" : ` (نسخة ${n})`;
    const candidate = root.slice(0, TEMPLATE_NAME_MAX - suffix.length).trim() + suffix;
    if (!taken.has(templateNameKey(candidate))) return candidate;
  }
}

export const templateName = z
  .string({ error: "اكتب اسم القالب" })
  .transform(normalizeTemplateName)
  .refine((v) => v.length >= TEMPLATE_NAME_MIN && v.length <= TEMPLATE_NAME_MAX, "اسم القالب لازم يكون من 2 إلى 60 حرفًا")
  .refine((v) => !isUnnamedTemplate(v), "اختر اسمًا واضحًا للقالب بدل «قالب جديد» أو «مسودة جديدة»");

export const templateGoals = [
  ["hypertrophy", "تضخيم"],
  ["fat_loss", "تنشيف"],
  ["fitness", "لياقة"],
  ["strength", "قوة"],
  ["general", "صحة عامة"],
] as const;
export const templateLevels = [
  ["beginner", "مبتدئ"],
  ["intermediate", "متوسط"],
  ["advanced", "متقدم"],
] as const;
export const templateTags = {
  goal: z.enum(templateGoals.map(([v]) => v) as [string, ...string[]]).nullable().optional(),
  level: z.enum(templateLevels.map(([v]) => v) as [string, ...string[]]).nullable().optional(),
  days_per_week: z.number().int().min(1).max(7).nullable().optional(),
};
