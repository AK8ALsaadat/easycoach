import { z } from "zod";
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
    video: z.union([z.literal(""), z.url().startsWith("https://")]),
    sets: z.number().int().min(1).max(20),
    reps: z.string().min(1).max(60),
    rest: z.number().int().min(0).max(600),
    catalogId: z.string().max(160).optional(),
    mediaId: id.optional(),
    rowId: id.optional(),
  })
  .strict();
export const content = z
  .object({
    days: z
      .array(
        z
          .object({
            name: z.string().min(1).max(100),
            exercises: z.array(exercise).min(1).max(40),
          })
          .strict(),
      )
      .min(1)
      .max(14),
    nutrition: z
      .object({
        text: z.string().max(10000),
        calories: z.number().min(0).max(10000),
        protein: z.number().min(0).max(1000),
        carbs: z.number().min(0).max(1000),
        fat: z.number().min(0).max(1000),
        meals: z
          .array(
            z
              .object({
                name: z.string().min(1).max(100),
                time: z.string().max(40),
                foods: z.string().max(2000),
                calories: z.number().min(0).max(10000),
                protein: z.number().min(0).max(1000),
                carbs: z.number().min(0).max(1000),
                fat: z.number().min(0).max(1000),
              })
              .strict(),
          )
          .max(12)
          .optional(),
      })
      .strict(),
  })
  .strict();
export type Content = z.infer<typeof content>;
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
  }),
  template_save: z.object({
    id: id.optional(),
    name: z.string().min(2).max(140),
    content,
  }),
  program_save: z.object({
    client_id: id,
    name: z.string().min(2).max(140),
    content,
  }),
  program_publish: z.object({ id }),
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
  created_at: string;
  updated_at: string;
};
export type Exercise = {
  id: string;
  name: string;
  description: string;
  video: string;
};
export type Template = {
  id: string;
  name: string;
  content: Content;
  updated_at: string;
};
export type Program = Template & {
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
