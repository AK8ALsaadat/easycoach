import { z } from "zod";
import { clientInput, content, blankContent, date } from "./model";
import { detailsSchema, recordSchemas, type RecordKind } from "./management";
import type { ImportFile, ImportSheet } from "./import-preview";

export const categories = {
  clients: "العملاء",
  measurements: "القياسات",
  weights: "الأوزان",
  nutrition_targets: "أهداف التغذية",
  nutrition_logs: "التغذية الفعلية",
  workouts: "سجل التمرين",
  programs: "البرامج التاريخية",
  templates: "قوالب البرامج",
  checkins: "المراجعات الأسبوعية",
  goals: "الأهداف",
  notes: "ملاحظات المدرب",
  messages: "الرسائل",
  subscriptions: "الاشتراكات",
  payments: "الدفعات",
  skip: "تجاهل الورقة صراحة",
};
export type Category = keyof typeof categories;
export const fieldLabels: Record<string, string> = {
  name: "الاسم الكامل",
  email: "الإيميل",
  phone: "الجوال",
  birth_date: "تاريخ الميلاد",
  age: "العمر",
  gender: "الجنس",
  height: "الطول",
  start_date: "تاريخ البداية",
  status: "حالة العميل",
  date: "تاريخ السجل",
  weight: "الوزن",
  body_fat: "نسبة الدهون",
  bmi: "BMI",
  waist: "الخصر",
  chest: "الصدر",
  arm: "الذراع",
  thigh: "الفخذ",
  hips: "الحوض",
  calf: "الساق",
  calories: "السعرات",
  protein: "البروتين",
  carbs: "الكارب",
  fat: "الدهون",
  text: "النص",
  notes: "الملاحظات",
  target_weight: "الوزن المستهدف",
  goal: "الهدف",
  focus: "التركيز",
  program_name: "اسم البرنامج",
  program_ref: "معرف البرنامج بالمصدر",
  day_name: "اليوم التدريبي",
  weekday: "رقم يوم الأسبوع 0–6",
  exercise_name: "اسم التمرين",
  sets: "المجموعات",
  reps: "العدات",
  rest: "الراحة",
  rpe: "RPE",
  rir: "RIR",
  tempo: "الإيقاع",
  video: "رابط الفيديو",
  catalog_id: "معرف التمرين بالمكتبة",
  completed: "إكمال الحصة",
  sleep: "النوم 1–5",
  energy: "الطاقة 1–5",
  hunger: "الجوع 1–5",
  stress: "التوتر 1–5",
  training_adherence: "التزام التدريب %",
  nutrition_adherence: "التزام التغذية %",
  feedback: "التعليق",
  questions: "الأسئلة",
  coach_feedback: "رد المدرب",
  reviewed: "تمت المراجعة",
  subscription_ref: "معرف الاشتراك بالمصدر",
  end_date: "تاريخ النهاية",
  price: "قيمة الاشتراك",
  amount: "قيمة الدفعة",
  method: "طريقة الدفع",
  reference: "مرجع الدفعة",
  description: "وصف القالب",
  template_kind: "نوع القالب",
  meals_json: "تفاصيل الوجبات JSON",
  content_json: "محتوى البرنامج JSON",
  source_key: "معرف السجل بالمصدر",
  historical_only: "سجل محفوظ قبل التصحيح",
  author_type: "كاتب الرسالة",
  archived: "مؤرشف",
  previous_ref: "مرجع التجديد السابق",
  payment_kind: "نوع الحركة المالية",
  reverses_ref: "مرجع الدفعة المعكوسة",
  reason: "سبب العكس",
  photo_ids_json: "مراجع صور المراجعة JSON",
};
const aliases: Record<string, string[]> = {
  name: [
    "name",
    "fullname",
    "clientname",
    "الاسم",
    "الاسم الكامل",
    "اسم العميل",
    "اسم المتدرب",
  ],
  email: [
    "email",
    "clientemail",
    "الإيميل",
    "الايميل",
    "البريد الإلكتروني",
    "البريد",
  ],
  phone: ["phone", "mobile", "الجوال", "رقم الجوال", "الهاتف"],
  date: [
    "date",
    "entrydate",
    "recorddate",
    "التاريخ",
    "تاريخ السجل",
    "تاريخ القياس",
    "تاريخ الدفع",
  ],
  birth_date: ["dob", "birthdate", "dateofbirth", "تاريخ الميلاد"],
  body_fat: ["bodyfat", "bodyfatpercentage", "نسبة الدهون"],
  carbs: ["carbohydrates", "carbohydrate", "carbs", "الكربوهيدرات", "الكارب"],
  weight: ["weightkg", "bodyweight", "الوزن كجم"],
  program_name: ["program", "programname", "اسم البرنامج"],
  exercise_name: ["exercise", "exercisename", "اسم التمرين"],
  day_name: ["day", "trainingday", "اليوم", "اليوم التدريبي"],
  start_date: ["startdate", "تاريخ البداية", "تاريخ الاشتراك"],
  end_date: ["enddate", "expirydate", "تاريخ النهاية", "تاريخ الانتهاء"],
  text: ["message", "foods", "mealplan", "الرسالة", "خطة الوجبات", "النص"],
  arm: ["arms", "armcm", "الذراع", "الذراعين"],
  thigh: ["thighs", "الفخذ", "الفخذين"],
  calf: ["calves", "calfcm", "الساق", "السمانة"],
  protein: ["proteing", "protein", "البروتين"],
  fat: ["fatg", "fat", "الدهون"],
  calories: ["kcal", "calorietarget", "calories", "السعرات"],
  rest: ["restseconds", "resttime", "rest", "الراحة"],
  height: ["heightcm", "height", "الطول"],
  status: ["clientstatus", "status", "حالة العميل"],
  completed: ["complete", "completed", "completion", "إكمال الحصة"],
};
const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/[^\p{L}\p{N}]/gu, "");
export function workbookSheets(file: ImportFile): ImportSheet[] {
  return (
    file.sheets ?? [{ name: "CSV", headers: file.headers, rows: file.rows }]
  );
}
export type SheetMapping = {
  category: Category;
  fields: Record<string, number>;
};
export function autoMapping(sheet: ImportSheet): SheetMapping {
  const fields: Record<string, number> = {};
  sheet.headers.forEach((header, index) => {
    if (/^(custom|قياس)\s*:/i.test(header)) {
      fields["custom:" + header.split(":").slice(1).join(":").trim()] = index;
      return;
    }
    const key = Object.keys(fieldLabels).find((key) =>
      [key, fieldLabels[key], ...(aliases[key] ?? [])].some(
        (alias) => normalize(alias) === normalize(header),
      ),
    );
    if (key) fields[key] = index;
  });
  const title = normalize(sheet.name);
  let category: Category = "clients";
  let namedCategory = false;
  for (const [key, label] of Object.entries(categories))
    if (
      [normalize(key), normalize(label)].some(
        (name) => name && title.includes(name),
      )
    ) {
      category = key as Category;
      namedCategory = true;
    }
  if (
    !namedCategory &&
    category === "clients" &&
    fields.name === undefined &&
    fields.date !== undefined
  )
    category =
      fields.exercise_name !== undefined
        ? "workouts"
        : fields.calories !== undefined
          ? "nutrition_logs"
          : fields.waist !== undefined || fields.body_fat !== undefined
            ? "measurements"
            : fields.weight !== undefined
              ? "weights"
              : "clients";
  return { category, fields };
}
export function parseImportDate(value: string, order: "DMY" | "MDY" = "DMY") {
  const raw = digits(value.trim());
  let normalized = raw;
  if (/^\d{4}-\d\d-\d\d(?:T.*)?$/.test(raw)) normalized = raw.slice(0, 10);
  else if (/^\d{5}(?:\.\d+)?$/.test(raw))
    normalized = new Date(
      Date.UTC(1899, 11, 30) + Math.floor(Number(raw)) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
  else {
    const m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(raw);
    if (m)
      normalized = `${m[3]}-${(order === "DMY" ? m[2] : m[1]).padStart(2, "0")}-${(order === "DMY" ? m[1] : m[2]).padStart(2, "0")}`;
  }
  return date.parse(normalized);
}
function digits(s: string) {
  return s
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (ch) => String(ch.charCodeAt(0) - 1776));
}
const numeric = (value: string) => {
  const s = digits(value)
    .replace(/[\s٬,%٪]/g, "")
    .replace("٫", ".");
  if (!s || !Number.isFinite(Number(s)))
    throw Error("قيمة رقمية غير صالحة: " + value);
  return Number(s);
};
const truth = (value: string) => {
  if (/^(true|1|yes|نعم|مكتمل|تم|reviewed)$/i.test(value.trim())) return true;
  if (/^(false|0|no|لا|غير مكتمل|غير مراجع)$/i.test(value.trim())) return false;
  throw Error("قيمة منطقية غير صالحة: استخدم true/false أو نعم/لا");
};
export type MigrationRow = {
  sheet: string;
  row: number;
  category: Category;
  email: string;
  values: Record<string, string>;
  errors: string[];
  warnings: string[];
  existing: boolean;
  data?: {
    kind?: RecordKind;
    entry_date?: string;
    payload?: Record<string, unknown>;
    client?: { name: string; email: string; phone: string };
    details?: z.infer<typeof detailsSchema>;
    extra_rows?: MigrationRow[];
  };
};
export function previewFullImport(
  file: ImportFile,
  mappings: SheetMapping[],
  existingEmails: string[],
  order: "DMY" | "MDY" = "DMY",
): MigrationRow[] {
  const existing = new Set(existingEmails.map((v) => v.toLowerCase()));
  return workbookSheets(file).flatMap((sheet, sheetIndex) => {
    const mapping = mappings[sheetIndex] ?? autoMapping(sheet);
    if (mapping.category === "skip") return [];
    const indices = Object.values(mapping.fields).filter((i) => i >= 0);
    const duplicateMapping = new Set(indices).size !== indices.length;
    const unmapped = sheet.headers.filter((_, i) => !indices.includes(i));
    return sheet.rows.map((cells, index): MigrationRow => {
      const values = Object.fromEntries(
        Object.entries(mapping.fields)
          .filter(([, i]) => i >= 0)
          .map(([key, i]) => [key, (cells[i] ?? "").trim()]),
      );
      const email = (values.email ?? "").trim().toLowerCase();
      const row: MigrationRow = {
        sheet: sheet.name,
        row: sheet.rowNumbers?.[index] ?? index + 2,
        category: mapping.category,
        email,
        values,
        errors: [],
        warnings: unmapped.length
          ? ["أعمدة غير مربوطة: " + unmapped.join("، ")]
          : [],
        existing: existing.has(email),
      };
      try {
        if (values.source_key?.length > 160)
          throw Error("معرف المصدر أطول من 160 حرفًا");
        if (
          values.author_type &&
          !["coach", "client"].includes(values.author_type)
        )
          throw Error("كاتب الرسالة غير صالح");
        for (const key of ["reviewed", "archived"])
          if (values[key]) values[key] = String(truth(values[key]));
        if (duplicateMapping) throw Error("اربط كل عمود بحقل واحد فقط");
        if (mapping.category !== "templates") z.email().parse(email);
        if (mapping.category === "clients") {
          const rawPhone = (values.phone ?? "").replace(/[\s()\-]/g, "");
          const client = clientInput.omit({ id: true }).parse({
            name: values.name,
            email,
            phone: /^5\d{8}$/.test(rawPhone) ? "0" + rawPhone : rawPhone,
          });
          const details: Record<string, unknown> = {};
          for (const key of ["birth_date", "start_date"])
            if (values[key]) details[key] = parseImportDate(values[key], order);
          for (const key of ["age", "height"])
            if (values[key]) details[key] = numeric(values[key]);
          if (values.gender)
            details.gender =
              (
                {
                  ذكر: "male",
                  أنثى: "female",
                  انثى: "female",
                  male: "male",
                  female: "female",
                  other: "other",
                  unspecified: "unspecified",
                } as Record<string, string>
              )[values.gender.toLowerCase()] ?? values.gender;
          if (values.status)
            details.status =
              (
                {
                  نشط: "active",
                  غيرنشط: "inactive",
                  جديد: "new",
                  active: "active",
                  inactive: "inactive",
                  new: "new",
                } as Record<string, string>
              )[values.status.replaceAll(" ", "").toLowerCase()] ??
              values.status;
          const extraCategories: Category[] = [];
          if (
            Object.keys(values).some(
              (key) =>
                ([
                  "weight",
                  "body_fat",
                  "waist",
                  "chest",
                  "arm",
                  "thigh",
                  "hips",
                  "calf",
                  "bmi",
                ].includes(key) ||
                  key.startsWith("custom:")) &&
                values[key],
            )
          )
            extraCategories.push("measurements");
          if (
            ["calories", "protein", "carbs", "fat"].some((key) => values[key])
          )
            extraCategories.push("nutrition_targets");
          if (values.goal || values.target_weight || values.focus)
            extraCategories.push("goals");
          if (values.exercise_name || values.content_json)
            extraCategories.push("programs");
          if (values.notes) extraCategories.push("notes");
          const keys = Object.keys(values);
          const normalizedValues: Record<string, string> = {
            ...values,
            date: values.date || values.start_date || "",
          };
          if (!keys.includes("date")) keys.push("date");
          const extra_rows = extraCategories
            .flatMap((category) =>
              previewFullImport(
                {
                  headers: keys,
                  rows: [keys.map((key) => normalizedValues[key] ?? "")],
                },
                [
                  {
                    category,
                    fields: Object.fromEntries(keys.map((key, i) => [key, i])),
                  },
                ],
                existingEmails,
                order,
              ),
            )
            .map((extra) => ({ ...extra, sheet: sheet.name, row: row.row }));
          row.errors.push(
            ...extra_rows.flatMap((extra) =>
              extra.errors.map(
                (error) => `${categories[extra.category]}: ${error}`,
              ),
            ),
          );
          row.data = {
            client,
            details: detailsSchema.parse(details),
            extra_rows,
          };
        } else {
          const day = values.date
            ? parseImportDate(values.date, order)
            : mapping.category === "templates"
              ? "2000-01-01"
              : undefined;
          if (!day && !["subscriptions", "payments"].includes(mapping.category))
            throw Error("تاريخ السجل مطلوب للحفاظ على التاريخ الأصلي");
          let kind: RecordKind | undefined;
          let payload: Record<string, unknown> = {};
          if (["measurements", "weights"].includes(mapping.category)) {
            kind = "measurement";
            for (const key of [
              "weight",
              "body_fat",
              "bmi",
              "waist",
              "chest",
              "arm",
              "thigh",
              "hips",
              "calf",
            ])
              if (values[key]) payload[key] = numeric(values[key]);
            const custom = Object.fromEntries(
              Object.entries(values)
                .filter(([key, value]) => key.startsWith("custom:") && value)
                .map(([key, value]) => [key.slice(7), numeric(value)]),
            );
            if (Object.keys(custom).length) payload.custom = custom;
            if (!Object.keys(payload).length)
              throw Error("لا توجد قياسات رقمية في الصف");
            payload.notes = values.notes ?? "";
            if (values.historical_only)
              payload.historical_only = truth(values.historical_only);
          } else if (
            ["nutrition_targets", "nutrition_logs"].includes(mapping.category)
          ) {
            kind =
              mapping.category === "nutrition_targets"
                ? "nutrition_target"
                : "nutrition_log";
            for (const key of ["calories", "protein", "carbs", "fat"])
              payload[key] = numeric(values[key] ?? "");
            if (kind === "nutrition_target") {
              payload.text = values.text ?? "";
              if (values.meals_json)
                payload.meals = JSON.parse(values.meals_json);
            } else payload.notes = values.notes ?? "";
          } else if (mapping.category === "checkins") {
            kind = "checkin";
            for (const key of [
              "sleep",
              "energy",
              "hunger",
              "stress",
              "training_adherence",
              "nutrition_adherence",
            ])
              payload[key] = numeric(values[key] ?? "");
            if (values.weight) payload.weight = numeric(values.weight);
            payload.feedback = values.feedback ?? "";
            payload.questions = values.questions ?? "";
            const photoIds = values.photo_ids_json
              ? JSON.parse(values.photo_ids_json)
              : [];
            if (!Array.isArray(photoIds) || photoIds.length)
              throw Error(
                "مراجع الصور تخص الحساب المصدر؛ ارفع الصور واربطها بالمراجعة داخل الحساب المستهدف",
              );
            payload.photo_ids = [];
          } else if (["notes", "messages"].includes(mapping.category)) {
            kind = mapping.category === "notes" ? "note" : "message";
            payload = {
              text: values.text || values.notes || values.feedback || "",
            };
          } else if (mapping.category === "workouts") {
            if (!values.completed || !values.day_name)
              throw Error("اليوم وحالة إكمال الحصة مطلوبان");
            kind = "workout_log";
            payload = {
              day_name: values.day_name || "حصة تدريبية",
              completed: truth(values.completed || "true"),
              notes: values.notes ?? "",
              exercises: values.exercise_name
                ? [
                    {
                      name: values.exercise_name,
                      sets: numeric(values.sets || "0"),
                      reps: values.reps ?? "",
                      ...(values.weight
                        ? { weight: numeric(values.weight) }
                        : {}),
                      ...(values.rpe ? { rpe: numeric(values.rpe) } : {}),
                      ...(values.rir ? { rir: numeric(values.rir) } : {}),
                    },
                  ]
                : [],
            };
          } else if (["programs", "templates"].includes(mapping.category)) {
            const plan = values.content_json
              ? content.parse(JSON.parse(values.content_json))
              : structuredClone(blankContent);
            if (!values.content_json) {
              if (
                !values.sets ||
                !values.reps ||
                !values.rest ||
                !values.day_name ||
                !values.exercise_name
              )
                throw Error(
                  "اسم اليوم والتمرين والمجموعات والتكرارات والراحة مطلوبة",
                );
              plan.days = [
                {
                  name: values.day_name || "اليوم الأول",
                  ...(values.weekday
                    ? { weekday: numeric(values.weekday) }
                    : {}),
                  exercises: [
                    {
                      name: values.exercise_name ?? "",
                      description: values.notes ?? "",
                      video: values.video ?? "",
                      sets: numeric(values.sets || "3"),
                      reps: values.reps || "10–12",
                      rest: numeric(values.rest || "60"),
                      ...(values.catalog_id
                        ? { catalogId: values.catalog_id }
                        : {}),
                      ...(values.weight
                        ? { weight: numeric(values.weight) }
                        : {}),
                      ...(values.rpe ? { rpe: numeric(values.rpe) } : {}),
                      ...(values.rir ? { rir: numeric(values.rir) } : {}),
                      ...(values.tempo ? { tempo: values.tempo } : {}),
                    },
                  ],
                },
              ];
              if (values.calories)
                for (const key of [
                  "calories",
                  "protein",
                  "carbs",
                  "fat",
                ] as const)
                  plan.nutrition[key] = numeric(values[key] || "0");
              plan.nutrition.text = values.text ?? "";
              if (values.meals_json)
                plan.nutrition.meals = JSON.parse(values.meals_json);
            }
            kind = "program_history";
            payload = {
              name: values.program_name || values.name || "",
              content: content.parse(plan),
            };
          } else if (mapping.category === "goals") {
            kind = "goal_history";
            payload = {
              goal: values.goal ?? "",
              focus: values.focus ?? "",
              target_weight: values.target_weight
                ? numeric(values.target_weight)
                : null,
            };
          } else if (mapping.category === "subscriptions") {
            parseImportDate(values.start_date ?? "", order);
            parseImportDate(values.end_date ?? "", order);
            const amount = numeric(values.price ?? "");
            if (
              amount < 0 ||
              amount > 1000000 ||
              Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001
            )
              throw Error("قيمة الاشتراك غير صالحة");
            values.price = String(amount);
            if (values.previous_ref)
              throw Error(
                "تجديد اشتراك مرتبط: استورده عبر سجل الاشتراكات بعد مطابقة مرجع الباقة السابقة؛ لا نحذف العلاقة بصمت",
              );
          } else if (mapping.category === "payments") {
            parseImportDate(values.date ?? "", order);
            const amount = numeric(values.amount ?? "");
            if (
              amount <= 0 ||
              amount > 1000000 ||
              Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001
            )
              throw Error("قيمة الدفعة غير صالحة");
            values.amount = String(amount);
            if (
              (values.payment_kind && values.payment_kind !== "payment") ||
              values.reverses_ref
            )
              throw Error(
                "الحركات العكسية تحتاج مطابقة دفتر المدفوعات؛ لا نستوردها كدفعات عادية",
              );
            if (
              values.method &&
              ![
                "bank",
                "cash",
                "other",
                "تحويل بنكي",
                "تحويل",
                "نقدي",
                "أخرى",
              ].includes(values.method)
            )
              throw Error("طريقة الدفع غير صالحة");
            if (!values.subscription_ref)
              throw Error("مرجع الاشتراك مطلوب للدفعة");
          }
          if (kind)
            payload = recordSchemas[kind].parse(payload) as Record<
              string,
              unknown
            >;
          row.data = { kind, entry_date: day, payload };
        }
      } catch (error) {
        row.errors.push(
          error instanceof z.ZodError
            ? error.issues
                .map((i) => i.path.join(".") + ": " + i.message)
                .join("؛ ")
            : error instanceof Error
              ? error.message
              : "بيانات غير صالحة",
        );
      }
      return row;
    });
  });
}

export function groupedMigrationRows(rows: MigrationRow[]) {
  const output: MigrationRow[] = [];
  const programs = new Map<string, MigrationRow>();
  const workouts = new Map<string, MigrationRow>();
  for (const row of rows
    .filter((r) => !r.errors.length)
    .flatMap((row) => [row, ...(row.data?.extra_rows ?? [])])) {
    if (row.category === "workouts") {
      const key = [
        row.email,
        row.data?.entry_date,
        row.values.source_key || row.values.day_name,
      ].join("|");
      const previous = workouts.get(key);
      if (previous) {
        if (
          previous.data!.payload!.completed !== row.data!.payload!.completed ||
          previous.data!.payload!.notes !== row.data!.payload!.notes
        )
          throw Error("صفوف الحصة نفسها تحمل بيانات متعارضة");
        (previous.data!.payload!.exercises as unknown[]).push(
          ...(row.data!.payload!.exercises as unknown[]),
        );
      } else {
        const copy = structuredClone(row);
        workouts.set(key, copy);
        output.push(copy);
      }
      continue;
    }
    if (
      !["programs", "templates"].includes(row.category) ||
      row.values.content_json
    ) {
      output.push(row);
      continue;
    }
    const key = [
      row.category,
      row.email,
      row.values.program_ref || row.values.program_name,
      row.data?.entry_date,
    ].join("|");
    const previous = programs.get(key);
    if (!previous) {
      const copy = structuredClone(row);
      programs.set(key, copy);
      output.push(copy);
      continue;
    }
    const target = (previous.data!.payload!.content as z.infer<typeof content>)
      .days;
    if (row.values.calories) {
      (previous.data!.payload!.content as z.infer<typeof content>).nutrition = (
        row.data!.payload!.content as z.infer<typeof content>
      ).nutrition;
    }
    for (const key of ["description", "template_kind", "archived"])
      if (row.values[key]) previous.values[key] = row.values[key];
    for (const day of (row.data!.payload!.content as z.infer<typeof content>)
      .days) {
      const existing = target.find((d) => d.name === day.name);
      if (existing) existing.exercises.push(...day.exercises);
      else target.push(day);
    }
  }
  for (const row of output)
    if (row.data?.kind === "program_history")
      recordSchemas.program_history.parse(row.data.payload);
  return output;
}
