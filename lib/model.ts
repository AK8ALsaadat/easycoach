import { z } from "zod";
import { REPS_ERROR, REST_ERROR, SETS_ERROR, validReps } from "./program-validation";
import type { ManagementData } from "./management";
import { exactCaloriesFromMacros, hasOneDecimal, MACRO_LIMITS } from "./macros";
import { templateName } from "./template-names";
// Custom Arabic messages: browser/zod defaults are English and unclear.
const amount = (max: number, unit: string) =>
  z
    .number({ error: "اكتب رقمًا صالحًا" })
    .min(0, "القيمة لا تكون سالبة")
    .max(max, `الحد الأعلى ${max} ${unit}`)
    .refine(hasOneDecimal, "يُقبل رقم عشري واحد فقط بعد الفاصلة");
export const kcal = amount(MACRO_LIMITS.calories, "سعرة");
export const grams = amount(MACRO_LIMITS.grams, "غرام");
export const caloriesMode = z.enum(["auto", "manual"]);
/** In automatic mode the stored calories must equal the macro total (whole kcal). */
export function autoCaloriesIssue(value: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  calories_mode?: "auto" | "manual";
}) {
  if (value.calories_mode !== "auto") return null;
  const computed = exactCaloriesFromMacros(value);
  if (computed > MACRO_LIMITS.calories)
    return "مجموع الماكروز يتجاوز 10,000 سعرة. راجع الجرامات";
  return Math.abs(value.calories - computed) < 1
    ? null
    : "السعرات لا تطابق مجموع الماكروز في الوضع التلقائي";
}
export const id = z.string().uuid();
export const date = z.iso.date();
export const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
export const phone = z
  .string()
  .max(20)
  .refine(
    (v) => !v || /^(05\d{8}|\+9665\d{8}|9665\d{8})$/.test(v),
    "رقم سعودي غير صالح",
  );
export const exercise = z
  .object({
    name: z.string().trim().min(2).max(140),
    description: z.string().max(2000),
    coachNotes: z.string().max(2000).optional(),
    video: z.union([z.literal(""), z.url().startsWith("https://")]),
    sets: z.number({ error: SETS_ERROR }).int(SETS_ERROR).min(1, SETS_ERROR).max(20, SETS_ERROR),
    reps: z.string().max(60).refine(validReps, REPS_ERROR),
    rest: z.number({ error: REST_ERROR }).int(REST_ERROR).min(0, REST_ERROR).max(600, REST_ERROR),
    catalogId: z.string().max(160).optional(),
    mediaId: id.optional(),
    rowId: id.optional(),
    weight: z.number().min(0).max(1500).optional(),
    rpe: z.number().min(0).max(10).optional(),
    rir: z.number().int().min(0).max(20).optional(),
    tempo: z.string().max(40).optional(),
  })
  .strict();
export const content = z
  .object({
    days: z
      .array(
        z
          .object({
            name: z.string().min(1).max(100),
            weekday: z.number().int().min(0).max(6).optional(),
            exercises: z.array(exercise).min(1).max(40),
          })
          .strict(),
      )
      .min(1)
      .max(14),
    nutrition: z
      .object({
        text: z.string().max(10000),
        calories: kcal,
        protein: grams,
        carbs: grams,
        fat: grams,
        calories_mode: caloriesMode.optional(),
        meals: z
          .array(
            z
              .object({
                name: z.string().min(1).max(100),
                time: z.string().max(40),
                foods: z.string().max(2000),
                calories: kcal,
                protein: grams,
                carbs: grams,
                fat: grams,
              })
              .strict(),
          )
          .max(12)
          .optional(),
      })
      .strict()
      .superRefine((value, ctx) => {
        const issue = autoCaloriesIssue(value);
        if (issue) ctx.addIssue({ code: "custom", message: issue, path: ["calories"] });
      }),
  })
  .strict();
export type Content = z.infer<typeof content>;
/**
 * What a *draft* is allowed to look like. A coach who asked for three days and
 * has filled one must be able to save and come back to it; refusing the save
 * is how unsaved work gets lost. Only publishing requires a complete program —
 * enforced both in the editor (publishIssues) and on the row
 * (private.program_publish_issue), so no publish path can skip it.
 */
export const draftContent = content.safeExtend({
  days: z
    .array(
      z
        .object({
          name: z.string().min(1).max(100),
          weekday: z.number().int().min(0).max(6).optional(),
          exercises: z.array(exercise).max(40),
        })
        .strict(),
    )
    .min(1)
    .max(14),
});
export const clientInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(2).max(120),
  email,
  phone,
});
const price = z.number().min(0).max(1000000).multipleOf(0.01);
export const commands = {
  goal_save: z.object({
    client_id: id,
    goal: z.string().max(100),
    target_weight: z.number().min(20).max(400).nullable(),
    focus: z.string().max(200),
    notes: z.string().max(2000),
  }),
  weight_save: z.object({
    client_id: id,
    entry_date: date,
    weight: z.number().min(20).max(400),
  }),
  weight_delete: z.object({ client_id: id, entry_date: date }),
  portal_revoke: z.object({ client_id: id }),
  client_save: clientInput,
  import_clients: z.object({
    rows: z
      .array(clientInput.omit({ id: true }))
      .min(1)
      .max(2000),
    overwrite: z.boolean(),
  }),
  exercise_save: z.object({
    id: id.optional(),
    name: z.string().min(2).max(140),
    description: z.string().max(2000),
    video: z.union([z.literal(""), z.url().startsWith("https://")]),
    // Omitted keeps the stored clip; null clears it.
    media_id: id.nullable().optional(),
  }),
  exercise_delete: z.object({ id }),
  // New templates need a real name; the database re-checks names whenever they change.
  template_save: z
    .object({
      id: id.optional(),
      name: z.string().trim().min(2).max(140),
      content: draftContent,
    })
    .superRefine((value, ctx) => {
      if (value.id) return;
      const checked = templateName.safeParse(value.name);
      if (!checked.success) ctx.addIssue({ code: "custom", path: ["name"], message: checked.error.issues[0].message });
    }),
  program_save: z.object({
    client_id: id,
    name: z.string().min(2).max(140),
    content: draftContent,
    expected_draft_id: id.nullable().optional(),
    expected_edit_revision: z.number().int().positive().nullable().optional(),
  }),
  program_publish: z.object({ id, expected_edit_revision: z.number().int().positive().optional() }),
  subscription_create: z
    .object({
      client_id: id,
      name: z.string().min(2).max(100),
      start_date: date,
      end_date: date,
      price,
      previous_id: id.optional(),
    })
    .refine((v) => v.end_date >= v.start_date, "تاريخ الانتهاء يسبق البداية"),
  freeze_apply: z
    .object({ id, subscription_id: id, start_date: date, end_date: date })
    .refine((v) => v.end_date >= v.start_date, "فترة غير صالحة"),
  payment_add: z.object({
    id,
    subscription_id: id,
    amount: price.refine((v) => v > 0),
    method: z.enum(["bank", "cash", "other"]),
    paid_date: date,
    reference: z.string().max(120),
  }),
  payment_reverse: z.object({
    id,
    payment_id: id,
    reason: z.string().trim().min(5).max(1000),
  }),
  invite_create: z.object({
    client_id: id,
    token_hash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  invite_revoke: z.object({ id }),
  join_link_create: z.object({
    token_hash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  join_review: z.object({ id, approve: z.boolean() }),
  privacy_request: z.object({
    client_id: id,
    kind: z.enum(["correction", "deletion"]),
    details: z.string().min(5).max(2000),
  }),
  privacy_fulfill: z.object({
    id,
    resolution: z.string().trim().min(5).max(2000),
  }),
} as const;
export type Command = keyof typeof commands;
export type Profile = {
  id: string;
  name: string;
  email: string;
  role: "coach" | "trainee";
};
export type Client = {
  id: string;
  coach_id: string;
  name: string;
  email: string;
  phone: string;
  trainee_user_id: string | null;
  archived: boolean;
  archived_at?: string | null;
  archived_reason?: string | null;
  created_at: string;
  updated_at: string;
};
export type Exercise = {
  id: string;
  name: string;
  description: string;
  video: string;
  /** An uploaded clip the coach owns, shown wherever this exercise appears. */
  media_id?: string | null;
};
export type Template = {
  id: string;
  name: string;
  content: Content;
  updated_at: string;
};
export type Program = Template & {
  publication_number?: number | null;
  edit_revision?: number;
  client_id: string;
  published_at: string | null;
  created_at: string;
  version: number;
};
export type Subscription = {
  id: string;
  client_id: string;
  name: string;
  start_date: string;
  end_date: string;
  price: number;
  previous_id: string | null;
  created_at: string;
};
export type Freeze = {
  id: string;
  subscription_id: string;
  start_date: string;
  end_date: string;
  days: number;
};
export type Payment = {
  id: string;
  subscription_id: string;
  amount: number;
  method: string;
  paid_date: string;
  reference: string;
  kind: "payment" | "reversal";
  reverses: string | null;
  reason: string;
};
export type Invite = {
  id: string;
  client_id: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
};
export type JoinRequest = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
};
export type PrivacyRequest = {
  id: string;
  client_id: string;
  kind: string;
  details: string;
  status: string;
  resolution: string;
};
export type Snapshot = {
  page_info?: { total_active_clients: number; client_count: number; next_client: string | null; next_template: string | null; next_exercise: string | null };
  coach_branding?: import("./coach-branding").CoachBranding[];
  /** Trainee links whose coach archived them: access is paused, data is kept. */
  paused_access?: { client_id: string; coach: string | null }[];
  management?: ManagementData;
  weights: WeightEntry[];
  client_goals: ClientGoal[];
  portal_links: {
    id: string;
    client_id: string;
    revoked_at: string | null;
    expires_at: string;
    last_opened_at: string | null;
  }[];
  media_assets: {
    id: string;
    filename: string;
    size: number;
    status: string;
    created_at: string;
  }[];
  profile: Profile | null;
  clients: Client[];
  exercises: Exercise[];
  templates: Template[];
  programs: Program[];
  subscriptions: Subscription[];
  freezes: Freeze[];
  payments: Payment[];
  invitations: Invite[];
  join_requests: JoinRequest[];
  privacy_requests: PrivacyRequest[];
  audit: {
    id: string;
    action: string;
    created_at: string;
    entity_id: string | null;
    client_id?: string | null;
    detail?: string;
  }[];
};
export type WeightEntry = {
  id: string;
  client_id: string;
  entry_date: string;
  weight: number;
  updated_at: string;
};
export type ClientGoal = {
  client_id: string;
  goal: string;
  target_weight: number | null;
  focus: string;
  notes: string;
};
export type PortalData = {
  portal_color?: string | null;
  basic_only?: boolean;
  session_packages?: { id: string; name: string; start_date: string; end_date: string; remaining: number | null; attended: number; attendance: string[] }[];
  coach_branding?: import("./coach-branding").CoachBranding | null;
  client_id?: string;
  management?: ManagementData;
  name: string;
  coach: string;
  program: Program | null;
  weights: WeightEntry[];
  goal: ClientGoal | null;
  portalHash?: string;
};
export const blankContent: Content = {
  days: [
    {
      name: "اليوم الأول",
      exercises: [
        {
          name: "تمرين جديد",
          description: "",
          video: "",
          sets: 3,
          reps: "10–12",
          rest: 60,
        },
      ],
    },
  ],
  nutrition: { text: "", calories: 0, protein: 0, carbs: 0, fat: 0 },
};
