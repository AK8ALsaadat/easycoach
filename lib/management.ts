import { z } from "zod";
import { content, id, date } from "./model";
import { riyadhToday } from "./dates";

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
      bmi: z.number().positive().max(150).optional(),
      historical_only: z.boolean().optional(),
      custom: z
        .record(z.string().min(1).max(60), z.number().min(0).max(1000))
        .optional(),
      notes: text,
    })
    .strict(),
  nutrition_log: macrosSchema.extend({ notes: text }).strict(),
  nutrition_target: macrosSchema
    .extend({ text, meals: content.shape.nutrition.shape.meals })
    .strict(),
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
    .object({ name: z.string().min(2).max(140), content })
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
  details_save: z.object({ client_id: id, details: detailsSchema }),
  client_archive: z.object({ client_id: id, archived: z.boolean() }),
  record_save: recordInput,
  record_review: z.object({
    id,
    feedback: z.string().max(4000),
    reviewed: z.boolean(),
  }),
  messages_read: z.object({ client_id: id }),
  template_meta: z.object({
    id,
    description: z.string().max(2000),
    archived: z.boolean(),
    kind: z.enum(["workout", "nutrition"]),
  }),
  template_delete: z.object({ id }),
  template_duplicate: z.object({
    id,
    name: z.string().min(2).max(140).optional(),
  }),
  template_assign: z.object({
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
  kind: "workout" | "nutrition";
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
  }[];
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
) {
  const latest = records
    .filter(
      (r) =>
        r.client_id === clientId &&
        r.kind === "nutrition_target" &&
        r.entry_date <= riyadhToday(),
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
    (latest.entry_date < publishedDate ||
      (latest.entry_date === publishedDate &&
        Date.parse(latest.created_at) < Date.parse(publishedAt!)))
  )
    return undefined;
  return latest
    ? recordSchemas.nutrition_target.parse(latest.payload)
    : undefined;
}
