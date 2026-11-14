import { z } from "zod";
import { autoCaloriesIssue, caloriesMode, content, draftContent, id, date, grams, kcal } from "./model";
import { riyadhToday } from "./dates";
import { templateName, templateTags } from "./template-names";

export const detailsSchema = z
  .object({
    birth_date: date.nullable().optional(),
    age: z.number().int().min(0).max(120).nullable().optional(),
    gender: z.enum(["male", "female", "other", "unspecified"]).optional(),
    height: z.number().min(50).max(250).nullable().optional(),
    start_date: date.nullable().optional(),
    status: z.enum(["active", "inactive", "new"]).optional(),
  })
  .strict();
export const macrosSchema = z.object({
  calories: z.number().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(1000),
});
const text = z.string().max(4000).default("");
const scale = z.number().int().min(1).max(5);
export const recordSchemas = {
  measurement: z
    .object({
      weight: z.number().min(20).max(400).optional(),
      body_fat: z.number().min(0).max(100).optional(),
      waist: z.number().positive().max(300).optional(),
      chest: z.number().positive().max(300).optional(),
      arm: z.number().positive().max(200).optional(),
      thigh: z.number().positive().max(200).optional(),
      hips: z.number().positive().max(300).optional(),
      calf: z.number().positive().max(120).optional(),
      bmi: z.number().positive().max(150).optional(),
      historical_only: z.boolean().optional(),
      custom: z
        .record(z.string().min(1).max(60), z.number().min(0).max(1000))
        .optional(),
      notes: text,
    })
    .strict(),
  nutrition_log: macrosSchema.extend({ notes: text }).strict(),
  nutrition_target: z
    .object({
      calories: kcal,
      protein: grams,
      carbs: grams,
      fat: grams,
      calories_mode: caloriesMode.optional(),
      text,
      meals: content.shape.nutrition.shape.meals,
    })
    .strict()
    .superRefine((value, ctx) => {
      const issue = autoCaloriesIssue(value);
      if (issue) ctx.addIssue({ code: "custom", message: issue, path: ["calories"] });
    }),
  workout_log: z
    .object({
      day_name: z.string().min(1).max(100),
      completed: z.boolean(),
      program_id: id.optional(),
      notes: text,
      exercises: z
        .array(
          z
            .object({
              name: z.string().min(2).max(140),
              sets: z.number().int().min(0).max(100),
              reps: z.string().max(60),
              weight: z.number().min(0).max(1500).optional(),
              rpe: z.number().min(0).max(10).optional(),
              rir: z.number().int().min(0).max(20).optional(),
              set_logs: z.array(z.object({ reps: z.number().int().min(1).max(100), weight: z.number().min(0).max(1500).optional() }).strict()).min(1).max(20).optional(),
            })
            .strict(),
        )
        .max(40)
        .default([]),
    })
    .strict(),
  checkin: z
    .object({
      weight: z.number().min(20).max(400).optional(),
      sleep: scale,
      energy: scale,
      hunger: scale,
      stress: scale,
      training_adherence: z.number().min(0).max(100),
      nutrition_adherence: z.number().min(0).max(100),
      feedback: text,
      questions: text,
      photo_ids: z.array(id).max(6).default([]),
    })
    .strict(),
  note: z.object({ text: z.string().trim().min(1).max(4000) }).strict(),
  message: z.object({ text: z.string().trim().min(1).max(4000) }).strict(),
  program_history: z
    .object({ name: z.string().min(2).max(140), content: draftContent })
    .strict(),
  goal_history: z
    .object({
      goal: z.string().max(100),
      focus: z.string().max(200),
      target_weight: z.number().min(20).max(400).nullable(),
    })
    .strict(),
} as const;
export type RecordKind = keyof typeof recordSchemas;
export const recordInput = z
  .object({
    id,
    client_id: id,
    kind: z.enum(Object.keys(recordSchemas) as [RecordKind, ...RecordKind[]]),
    entry_date: date,
    payload: z.unknown(),
    source_key: z.string().min(1).max(160).optional(),
    /** Portal the record was written from; decides the sender when one account is both coach and trainee. */
    author_type: z.enum(["coach", "client"]).optional(),
  })
  .strict()
  .transform((row, ctx) => {
    const checked = recordSchemas[row.kind].safeParse(row.payload);
    if (!checked.success) {
      for (const issue of checked.error.issues)
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: ["payload", ...issue.path],
        });
      return z.NEVER;
    }
    return { ...row, payload: checked.data };
  });
export const managementCommands = {
  // Updates keep a legacy name until it changes; the database re-checks any changed name.
  template_save_typed: z
    .object({ id: id.optional(), name: z.string().trim().min(2).max(140), content: draftContent, kind: z.enum(["workout", "nutrition", "nutrition_targets"]), description: z.string().max(2000).default(""), archived: z.boolean().default(false), ...templateTags })
    .superRefine((value, ctx) => {
      if (value.id) return;
      const checked = templateName.safeParse(value.name);
      if (!checked.success) ctx.addIssue({ code: "custom", path: ["name"], message: checked.error.issues[0].message });
    }),
  details_save: z.object({ client_id: id, details: detailsSchema }),
  client_archive: z.object({
    client_id: id,
    archived: z.boolean(),
    reason: z.string().trim().max(500, "اختصر السبب إلى 500 حرف").optional(),
  }),
  record_save: recordInput,
  record_review: z.object({
    id,
    feedback: z.string().max(4000),
    reviewed: z.boolean(),
  }),
  messages_read: z.object({ client_id: id, side: z.enum(["coach", "client"]).optional() }),
  template_meta: z.object({
    id,
    description: z.string().max(2000),
    archived: z.boolean(),
    kind: z.enum(["workout", "nutrition", "nutrition_targets"]),
    ...templateTags,
  }),
  template_delete: z.object({ id }),
  template_duplicate: z.object({
    id,
    name: templateName.optional(),
  }),
  template_rename: z.object({ id, name: templateName }),
  template_touch: z.object({ id }),
  template_assign: z.object({
    operation_id: id.optional(),
    id,
    clients: z.array(id).min(1).max(100),
    replace_drafts: z.boolean().default(false),
    publish: z.boolean().default(false),
  }),
  preferences_save: z.object({
    language: z.enum(["ar", "en"]),
    checkin_days: z.number().int().min(1).max(30),
    weight_days: z.number().int().min(1).max(90),
    reminders: z.boolean(),
    low_adherence: z.number().min(0).max(100),
  }),
  import_undo: z.object({ id }),
} as const;
export type Details = z.infer<typeof detailsSchema> & {
  client_id: string;
  coach_id: string;
};
export type CoachingRecord = {
  updated_at?: string;
  modified_by_type?: "coach" | "client" | null;
  revision?: number;
  id: string;
  client_id: string;
  coach_id: string;
  kind: RecordKind;
  entry_date: string;
  payload: Record<string, unknown>;
  author_id: string | null;
  author_type: "coach" | "client";
  source_key: string;
  reviewed_at: string | null;
  coach_feedback: string;
  read_at: string | null;
  created_at: string;
};
export type TemplateMeta = {
  template_id: string;
  description: string;
  archived: boolean;
  kind: "workout" | "nutrition" | "nutrition_targets";
  goal?: string | null;
  level?: string | null;
  days_per_week?: number | null;
  last_used_at?: string | null;
};
export type Preferences = {
  language: "ar" | "en";
  checkin_days: number;
  weight_days: number;
  reminders: boolean;
  low_adherence: number;
};
export type ManagementData = {
  details: Details[];
  records: CoachingRecord[];
  template_metadata: TemplateMeta[];
  import_batches: {
    id: string;
    created_at: string;
    status: string;
    report: Record<string, number | boolean>;
  }[];
  preferences: Preferences;
  progress_photos: {
    id: string;
    client_id: string;
    entry_date: string;
    filename: string;
    status: string;
    angle: "front" | "back" | "side" | "unspecified";
    consented_at: string | null;
    consent_source?: "trainee" | "coach_attestation" | null;
    created_at: string;
  }[];
  schedules?: { client_id: string; weight_days: number; measurement_days: number; photo_days: number }[];
  photo_consents?: import("./photo-consent").PhotoConsentState[];
};
export const defaultPreferences: Preferences = {
  language: "ar",
  checkin_days: 7,
  weight_days: 7,
  reminders: true,
  low_adherence: 60,
};

export function actualMacros(records: CoachingRecord[], clientId: string) {
  const days = new Map<string, CoachingRecord>();
  for (const record of records
    .filter((r) => r.client_id === clientId && r.kind === "nutrition_log")
    .sort((a, b) => a.created_at.localeCompare(b.created_at)))
    days.set(record.entry_date, record);
  return [...days.values()].sort((a, b) =>
    a.entry_date.localeCompare(b.entry_date),
  );
}
export function effectiveNutrition(
  records: CoachingRecord[],
  clientId: string,
  publishedAt?: string | null,
  today = riyadhToday(),
) {
  const latest = records
    .filter(
      (r) =>
        r.client_id === clientId &&
        r.kind === "nutrition_target" &&
        r.entry_date <= today,
    )
    .sort(
      (a, b) =>
        b.entry_date.localeCompare(a.entry_date) ||
        b.created_at.localeCompare(a.created_at),
    )[0];
  const publishedDate = publishedAt
    ? riyadhToday(new Date(publishedAt))
    : undefined;
  if (
    latest &&
    publishedDate &&
    latest.entry_date < publishedDate
  )
    return undefined;
  return latest ? readNutritionTarget(latest.payload) : undefined;
}
export type NutritionTarget = z.infer<typeof recordSchemas.nutrition_target>;
/**
 * Reading must never fail on a stored target that predates a stricter write rule
 * (e.g. two decimals). Writes still go through the strict schema.
 */
export function readNutritionTarget(payload: Record<string, unknown>): NutritionTarget {
  const checked = recordSchemas.nutrition_target.safeParse(payload);
  if (checked.success) return checked.data;
  const number = (key: string) => (typeof payload[key] === "number" && Number.isFinite(payload[key]) ? (payload[key] as number) : 0);
  return {
    calories: number("calories"),
    protein: number("protein"),
    carbs: number("carbs"),
    fat: number("fat"),
    calories_mode: payload.calories_mode === "auto" || payload.calories_mode === "manual" ? payload.calories_mode : undefined,
    text: typeof payload.text === "string" ? payload.text : "",
    meals: Array.isArray(payload.meals) ? (payload.meals as NutritionTarget["meals"]) : undefined,
  };
}
