import ExcelJS from "exceljs";
import type { Content, Snapshot } from "./model";
import type { CoachingRecord } from "./management";

type Row = Record<string, unknown>;
export async function exportWorkbook(data: Snapshot) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EasyCoach";
  workbook.created = new Date();
  const emails = new Map(
    data.clients.map((client) => [client.id, client.email]),
  );
  const records = data.management?.records ?? [];
  function sheet(name: string, rows: Row[], headers?: string[]) {
    const keys = headers ?? [
      ...new Set(rows.flatMap((row) => Object.keys(row))),
    ];
    const tab = workbook.addWorksheet(name, {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
    });
    tab.columns = keys.map((key) => ({
      header: key,
      key,
      width:
        key.includes("text") ||
        key.includes("notes") ||
        key.includes("feedback")
          ? 45
          : key.includes("email")
            ? 32
            : 22,
    }));
    for (const row of rows) {
      tab.addRow(
        Object.fromEntries(
          keys.map((key) => {
            const value = row[key];
            const cell =
              value == null
                ? ""
                : typeof value === "object"
                  ? JSON.stringify(value)
                  : value;
            if (typeof cell === "string" && cell.length > 32767)
              throw Error(
                "حقل أكبر من حد خلية Excel؛ استخدم تصدير JSON الكامل",
              );
            return [key, cell];
          }),
        ),
      );
    }
    tab.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    tab.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2463EB" },
    };
    tab.getRow(1).height = 25;
    if (keys.length)
      tab.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: keys.length },
      };
    return tab;
  }
  const personal = new Map(
    data.management?.details.map((detail) => [detail.client_id, detail]) ?? [],
  );
  sheet(
    "Clients",
    data.clients.map((client) => ({
      name: client.name,
      email: client.email,
      phone: client.phone,
      ...Object.fromEntries(
        Object.entries(personal.get(client.id) ?? {}).filter(
          ([key]) => !["client_id", "coach_id", "updated_at"].includes(key),
        ),
      ),
      status: client.archived
        ? "inactive"
        : (personal.get(client.id)?.status ?? "active"),
    })),
    [
      "name",
      "email",
      "phone",
      "birth_date",
      "age",
      "gender",
      "height",
      "start_date",
      "status",
    ],
  );
  function recordRow(record: CoachingRecord): Row {
    return {
      email: emails.get(record.client_id) ?? "",
      date: record.entry_date,
      source_key: record.source_key,
      ...record.payload,
    };
  }
  const measurements = records
    .filter((record) => record.kind === "measurement")
    .map((record) => {
      const { custom, ...row } = recordRow(record);
      return {
        ...row,
        ...Object.fromEntries(
          Object.entries((custom ?? {}) as Record<string, unknown>).map(
            ([key, value]) => ["custom:" + key, value],
          ),
        ),
      };
    });
  const recordIds = new Set(records.map((record) => record.id));
  for (const weight of data.weights ?? [])
    if (!recordIds.has(weight.id))
      measurements.push({
        email: emails.get(weight.client_id) ?? "",
        date: weight.entry_date,
        source_key: "weight:" + weight.id,
        weight: weight.weight,
      });
  sheet("Measurements", measurements, [
    ...new Set([
      "email",
      "date",
      "source_key",
      "weight",
      "body_fat",
      "waist",
      "chest",
      "arm",
      "thigh",
      "hips",
      "bmi",
      "historical_only",
      "notes",
      ...measurements
        .flatMap((row) => Object.keys(row))
        .filter((key) => key.startsWith("custom:")),
    ]),
  ]);
  sheet(
    "NutritionTargets",
    records
      .filter((record) => record.kind === "nutrition_target")
      .map((record) => {
        const { meals, ...row } = recordRow(record);
        return { ...row, meals_json: meals };
      }),
    [
      "email",
      "date",
      "source_key",
      "calories",
      "protein",
      "carbs",
      "fat",
      "text",
      "meals_json",
    ],
  );
  sheet(
    "NutritionLogs",
    records.filter((record) => record.kind === "nutrition_log").map(recordRow),
    [
      "email",
      "date",
      "source_key",
      "calories",
      "protein",
      "carbs",
      "fat",
      "notes",
    ],
  );
  sheet(
    "Workouts",
    records
      .filter((record) => record.kind === "workout_log")
      .flatMap((record) => {
        const row = recordRow(record);
        const exercises = (record.payload.exercises as Array<Row>) ?? [];
        return (exercises.length ? exercises : [{}]).map((exercise) => ({
          email: row.email,
          date: row.date,
          source_key: row.source_key,
          day_name: row.day_name,
          completed: row.completed,
          notes: row.notes,
          ...exercise,
          exercise_name: exercise.name,
          name: undefined,
        }));
      }),
    [
      "email",
      "date",
      "source_key",
      "day_name",
      "completed",
      "exercise_name",
      "sets",
      "reps",
      "weight",
      "rpe",
      "rir",
      "notes",
    ],
  );
  function planRows(
    name: string,
    plan: Content,
    ref: string,
    email: string,
    day: string,
    extra: Row = {},
  ): Row[] {
    let first = true;
    return plan.days.flatMap((trainingDay) =>
      trainingDay.exercises.map((exercise) => {
        const row = {
          email,
          date: day,
          program_ref: ref,
          program_name: name,
          day_name: trainingDay.name,
          weekday: trainingDay.weekday,
          exercise_name: exercise.name,
          sets: exercise.sets,
          reps: exercise.reps,
          rest: exercise.rest,
          weight: exercise.weight,
          rpe: exercise.rpe,
          rir: exercise.rir,
          tempo: exercise.tempo,
          notes: exercise.description,
          video: exercise.video,
          catalog_id: exercise.catalogId,
          ...(first
            ? {
                calories: plan.nutrition.calories,
                protein: plan.nutrition.protein,
                carbs: plan.nutrition.carbs,
                fat: plan.nutrition.fat,
                text: plan.nutrition.text,
                meals_json: plan.nutrition.meals,
                ...extra,
              }
            : {}),
        };
        first = false;
        return row;
      }),
    );
  }
  const programRows = data.programs.flatMap((program) =>
    planRows(
      program.name,
      program.content,
      program.id,
      emails.get(program.client_id) ?? "",
      (program.published_at ?? program.created_at).slice(0, 10),
    ),
  );
  for (const record of records.filter(
    (record) => record.kind === "program_history",
  ))
    programRows.push(
      ...planRows(
        String(record.payload.name),
        record.payload.content as Content,
        record.source_key,
        emails.get(record.client_id) ?? "",
        record.entry_date,
      ),
    );
  const planHeaders = [
    "email",
    "date",
    "program_ref",
    "program_name",
    "day_name",
    "weekday",
    "exercise_name",
    "sets",
    "reps",
    "rest",
    "weight",
    "rpe",
    "rir",
    "tempo",
    "notes",
    "video",
    "catalog_id",
    "calories",
    "protein",
    "carbs",
    "fat",
    "text",
    "meals_json",
  ];
  sheet("Programs", programRows, planHeaders);
  sheet(
    "Templates",
    data.templates.flatMap((template) => {
      const metadata = data.management?.template_metadata.find(
        (meta) => meta.template_id === template.id,
      );
      return planRows(
        template.name,
        template.content,
        template.id,
        "",
        template.updated_at.slice(0, 10),
        {
          description: metadata?.description ?? "",
          template_kind: metadata?.kind ?? "workout",
          archived: metadata?.archived ?? false,
        },
      );
    }),
    [...planHeaders, "description", "template_kind", "archived"],
  );
  const goals = records
    .filter((record) => record.kind === "goal_history")
    .map(recordRow);
  for (const goal of data.client_goals ?? [])
    goals.push({
      email: emails.get(goal.client_id),
      date: (goal as unknown as { updated_at: string }).updated_at?.slice(
        0,
        10,
      ),
      source_key: "current-goal:" + goal.client_id,
      goal: goal.goal,
      focus: goal.focus,
      target_weight: goal.target_weight,
      notes: goal.notes,
    });
  sheet("Goals", goals, [
    "email",
    "date",
    "source_key",
    "goal",
    "focus",
    "target_weight",
    "notes",
  ]);
  sheet(
    "Checkins",
    records
      .filter((record) => record.kind === "checkin")
      .map((record) => ({
        ...recordRow(record),
        reviewed: Boolean(record.reviewed_at),
        coach_feedback: record.coach_feedback,
        photo_ids_json: record.payload.photo_ids ?? [],
      })),
    [
      "email",
      "date",
      "source_key",
      "weight",
      "sleep",
      "energy",
      "hunger",
      "stress",
      "training_adherence",
      "nutrition_adherence",
      "feedback",
      "questions",
      "reviewed",
      "coach_feedback",
      "photo_ids_json",
    ],
  );
  sheet(
    "Notes",
    records.filter((record) => record.kind === "note").map(recordRow),
    ["email", "date", "source_key", "text"],
  );
  sheet(
    "Messages",
    records
      .filter((record) => record.kind === "message")
      .map((record) => ({
        ...recordRow(record),
        author_type: (record as unknown as { author_type: string }).author_type,
      })),
    ["email", "date", "source_key", "text", "author_type"],
  );
  sheet(
    "Subscriptions",
    data.subscriptions.map((subscription) => ({
      email: emails.get(subscription.client_id),
      subscription_ref: subscription.id,
      name: subscription.name,
      start_date: subscription.start_date,
      end_date: subscription.end_date,
      price: subscription.price,
      previous_ref: subscription.previous_id,
    })),
    [
      "email",
      "subscription_ref",
      "name",
      "start_date",
      "end_date",
      "price",
      "previous_ref",
    ],
  );
  sheet(
    "Payments",
    data.payments.map((payment) => {
      const subscription = data.subscriptions.find(
        (subscription) => subscription.id === payment.subscription_id,
      );
      return {
        email: subscription ? emails.get(subscription.client_id) : "",
        source_key: payment.id,
        subscription_ref: payment.subscription_id,
        date: payment.paid_date,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        payment_kind: payment.kind,
        reverses_ref: payment.reverses,
        reason: payment.reason,
      };
    }),
    [
      "email",
      "date",
      "source_key",
      "subscription_ref",
      "amount",
      "method",
      "reference",
      "payment_kind",
      "reverses_ref",
      "reason",
    ],
  );
  if (data.management?.progress_photos.length)
    sheet(
      "ProgressPhotos",
      data.management.progress_photos.map((photo) => ({
        email: emails.get(photo.client_id),
        date: photo.entry_date,
        filename: photo.filename,
        status: photo.status,
        photo_id: photo.id,
      })),
      ["email", "date", "filename", "status", "photo_id"],
    );
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
