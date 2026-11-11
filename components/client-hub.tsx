"use client";
import Link from "next/link";
import { useLocale } from "./locale-provider";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, Check, Download } from "lucide-react";
import { manage, portalManage, saveClientSchedule } from "@/app/management-actions";
import { mutate, type Result } from "@/app/actions";
import {
  actualMacros,
  effectiveNutrition,
  type ManagementData,
  type RecordKind,
} from "@/lib/management";
import { blankContent, type Program, type WeightEntry } from "@/lib/model";
import { riyadhToday } from "@/lib/dates";
import { Notice } from "./forms";
import { ProgressChart } from "./progress-chart";
import { ProgressPhotos } from "./progress-photo-panel";
import { ManagementButton } from "./management-button";
const measurementLabels: Record<string, string> = {
  weight: "الوزن",
  body_fat: "نسبة الدهون",
  waist: "الخصر",
  chest: "الصدر",
  arm: "الذراع",
  thigh: "الفخذ",
  hips: "الحوض",
  calf: "الساق",
  bmi: "BMI",
  notes: "الملاحظات",
};

type HubProps = {
  clientId: string;
  management?: ManagementData;
  weights: WeightEntry[];
  program?: Program;
  targetWeight?: number | null;
  coach?: boolean;
  showRenewalRequest?: boolean;
  portalToken?: string;
  portalHash?: string;
  onUpdate?: () => Promise<unknown>;
};
const labels: Record<RecordKind, string> = {
  measurement: "قياس",
  nutrition_log: "تغذية فعلية",
  nutrition_target: "أهداف تغذية",
  workout_log: "حصة تدريبية",
  checkin: "مراجعة أسبوعية",
  note: "ملاحظة خاصة",
  message: "رسالة",
  program_history: "برنامج تاريخي",
  goal_history: "هدف تاريخي",
};
export function ClientHub({
  clientId,
  management,
  weights,
  program,
  targetWeight,
  coach = false,
  showRenewalRequest = false,
  portalToken,
  portalHash,
  onUpdate,
}: HubProps) {
  const { t: tr } = useLocale();

  const router = useRouter();
  const [tab, setTab] = useState("progress"),
    [metric, setMetric] = useState("weight"),
    [exerciseName, setExerciseName] = useState("");
  const [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [renewalRequestedFor, setRenewalRequestedFor] = useState<string | null>(null),
    [recordPage, setRecordPage] = useState(0),
    [workoutPage, setWorkoutPage] = useState(0);
  const renewalRequested = renewalRequestedFor === clientId;
  const renewalRequest = useRef<{ clientId: string; id: string; day: string; text: string } | null>(null);
  const details = management?.details.find(
    (detail) => detail.client_id === clientId,
  );
  const records = useMemo(
    () =>
      (management?.records ?? []).filter(
        (record) => record.client_id === clientId,
      ),
    [management, clientId],
  );
  const checkins = records.filter((record) => record.kind === "checkin");
  const actual = actualMacros(records, clientId);
  const targets = records
    .filter((record) => record.kind === "nutrition_target")
    .sort(
      (a, b) =>
        b.entry_date.localeCompare(a.entry_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  const currentTarget =
    effectiveNutrition(records, clientId, program?.published_at) ??
    program?.content.nutrition;
  const measurements = records.filter(
    (record) => record.kind === "measurement",
  );
  const exerciseNames = useMemo(
    () => [
      ...new Set(
        records
          .filter((record) => record.kind === "workout_log")
          .flatMap((record) =>
            ((record.payload.exercises as Array<{ name: string }>) ?? []).map(
              (exercise) => exercise.name,
            ),
          ),
      ),
    ],
    [records],
  );
  const points = useMemo(() => {
    const days = new Map<
      string,
      { date: string; value: number; order: string }
    >();
    if (metric === "weight" || metric === "bmi")
      for (const entry of weights.filter(
        (weight) => weight.client_id === clientId,
      )) {
        const value =
          metric === "bmi" && details?.height
            ? Number(entry.weight) / (Number(details.height) / 100) ** 2
            : metric === "weight"
              ? Number(entry.weight)
              : undefined;
        if (value !== undefined)
          days.set(entry.entry_date, {
            date: entry.entry_date,
            value,
            order: entry.updated_at,
          });
      }
    if (metric === "strength")
      for (const record of records.filter(
        (record) => record.kind === "workout_log",
      )) {
        for (const exercise of (record.payload.exercises as Array<{
          name: string;
          weight?: number;
        }>) ?? []) {
          if (
            exercise.name !== (exerciseName || exerciseNames[0]) ||
            exercise.weight === undefined
          )
            continue;
          const previous = days.get(record.entry_date);
          if (!previous || previous.value < exercise.weight)
            days.set(record.entry_date, {
              date: record.entry_date,
              value: exercise.weight,
              order: record.created_at,
            });
        }
      }
    else
      for (const record of measurements) {
        if (record.payload.historical_only) continue;
        const raw =
          metric === "bmi"
            ? (record.payload.bmi ??
              (details?.height && typeof record.payload.weight === "number"
                ? record.payload.weight / (Number(details.height) / 100) ** 2
                : undefined))
            : record.payload[metric];
        if (typeof raw !== "number") continue;
        const old = days.get(record.entry_date);
        if (!old || old.order <= record.created_at)
          days.set(record.entry_date, {
            date: record.entry_date,
            value: raw,
            order: record.created_at,
          });
      }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [
    metric,
    weights,
    clientId,
    details,
    records,
    measurements,
    exerciseName,
    exerciseNames,
  ]);
  async function refresh() {
    if (onUpdate) await onUpdate();
    else router.refresh();
  }
  async function action(
    command: Parameters<typeof manage>[0],
    payload: unknown,
  ) {
    setBusy(true);
    try {
      const response =
        portalToken && ["record_save", "messages_read"].includes(command)
          ? await portalManage(
              portalToken,
              command as "record_save" | "messages_read",
              payload,
            )
          : await manage(command, payload);
      setResult(response);
      if (response.ok) await refresh();
      return response;
    } catch {
      const response = {
        ok: false,
        message: "تعذر الاتصال. لم نتأكد من الحفظ؛ أعد المحاولة بنفس البيانات.",
      };
      setResult(response);
      return response;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (coach) return;
    const openMessages = () => setTab("messages");
    window.addEventListener("easycoach:open-messages", openMessages);
    return () => window.removeEventListener("easycoach:open-messages", openMessages);
  }, [coach]);
  const tabs = [
    ["progress", "القياسات والتقدم"],
    ["nutrition", "الماكروز الفعلية"],
    ["workouts", "سجل التدريب"],
    ["checkins", "المراجعات الأسبوعية"],
    ["messages", "المراسلات"],
    ["photos", "صور التقدم"],
    ...(coach
      ? [
          ["details", "الملف الشخصي"],
          ["notes", "ملاحظات المدرب"],
        ]
      : []),
  ];
  return (
    <section
      id="client-management-hub"
      className="client-hub space-y-4"
      data-testid="client-management-hub"
    >
      <div
        className="library-tabs"
        role="tablist"
        aria-label={tr("متابعة العميل")}
      >
        {tabs.map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "library-tab-active" : ""}
            key={key}
            onClick={() => setTab(key)}
          >
            {tr(label)}
            {key === "checkins" &&
            coach &&
            checkins.some((record) => !record.reviewed_at) ? (
              <span className="badge ms-2">
                {checkins.filter((record) => !record.reviewed_at).length}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {tab === "details" && coach && (
        <form
          className="card p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const detailsResult = await action("details_save", {
              client_id: clientId,
              details: {
                birth_date: values.get("birth_date") || null,
                age: values.get("age") ? Number(values.get("age")) : null,
                gender: values.get("gender"),
                height: values.get("height")
                  ? Number(values.get("height"))
                  : null,
                start_date: values.get("start_date") || null,
                status: values.get("status"),
              },
            });
            if (!detailsResult.ok) return;
            const scheduleResult = await saveClientSchedule({
              client_id: clientId,
              weight_days: Number(values.get("weight_days")),
              measurement_days: Number(values.get("measurement_days")),
              photo_days: Number(values.get("photo_days")),
            });
            setResult(scheduleResult);
            if (scheduleResult.ok) await refresh();
          }}
        >
          <h2>{tr("المعلومات الشخصية وحالة المتدرب")}</h2>
          <p className="mt-2 text-sm text-muted">{tr("حدد موعد كل نوع من المتابعة. إذا لم تحفظ موعدًا خاصًا، تُستخدم الإعدادات العامة للوزن و30 يومًا للقياسات والصور.")}</p>
          <div className="grid gap-3 mt-4 sm:grid-cols-2 lg:grid-cols-3">
            <label>
              {tr("تاريخ الميلاد")}
              <input
                type="date"
                name="birth_date"
                className="field"
                max={riyadhToday()}
                defaultValue={details?.birth_date ?? ""}
              />
            </label>
            <label>
              {tr("العمر عند التسجيل (إن لم يتوفر الميلاد)")}
              <input
                name="age"
                type="number"
                min={0}
                max={120}
                className="field"
                defaultValue={details?.age ?? ""}
              />
            </label>
            <label>
              {tr("الجنس")}
              <select
                name="gender"
                className="field"
                defaultValue={details?.gender ?? "unspecified"}
              >
                <option value="unspecified">{tr("غير محدد")}</option>
                <option value="male">{tr("ذكر")}</option>
                <option value="female">{tr("أنثى")}</option>
                <option value="other">{tr("آخر")}</option>
              </select>
            </label>
            <label>
              {tr("الطول (سم)")}
              <input
                name="height"
                type="number"
                min={50}
                max={250}
                step=".1"
                className="field"
                defaultValue={details?.height ?? ""}
              />
            </label>
            <label>
              {tr("تاريخ البداية")}
              <input
                name="start_date"
                type="date"
                className="field"
                defaultValue={details?.start_date ?? ""}
              />
            </label>
            <label>
              {tr("الحالة")}
              <select
                name="status"
                className="field"
                defaultValue={details?.status ?? "active"}
              >
                <option value="active">{tr("نشط")}</option>
                <option value="inactive">{tr("غير نشط")}</option>
                <option value="new">{tr("جديد")}</option>
              </select>
            </label>
            <label>{tr("تكرار الوزن (أيام)")}<input name="weight_days" type="number" min={1} max={90} className="field" defaultValue={management?.schedules?.find((row) => row.client_id === clientId)?.weight_days ?? management?.preferences.weight_days ?? 7} /></label>
            <label>{tr("تكرار القياسات (أيام)")}<input name="measurement_days" type="number" min={1} max={180} className="field" defaultValue={management?.schedules?.find((row) => row.client_id === clientId)?.measurement_days ?? 30} /></label>
            <label>{tr("تكرار الصور (أيام)")}<input name="photo_days" type="number" min={1} max={180} className="field" defaultValue={management?.schedules?.find((row) => row.client_id === clientId)?.photo_days ?? 30} /></label>
          </div>
          <button className="btn mt-4" disabled={busy}>
            {tr("حفظ المعلومات الشخصية")}
          </button>
          <div className="mt-4">
            <ManagementButton
              command="client_archive"
              payload={{ client_id: clientId, archived: true }}
              confirmation={tr(
                "أرشفة العميل وإيقاف وصوله؟ تبقى سجلاته محفوظة ويمكن استعادته من قائمة المؤرشفين.",
              )}
            >
              {tr("أرشفة العميل")}
            </ManagementButton>
          </div>
        </form>
      )}
      {tab === "progress" && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1">
              {tr("المؤشر")}
              <select
                aria-label={tr("مؤشر التقدم")}
                className="field"
                value={metric}
                onChange={(event) => setMetric(event.target.value)}
              >
                {[
                  ["weight", tr("الوزن")],
                  ["body_fat", tr("نسبة الدهون")],
                  ["waist", tr("الخصر")],
                  ["chest", tr("الصدر")],
                  ["arm", tr("الذراع")],
                  ["thigh", tr("الفخذ")],
                  ["hips", tr("الحوض")],
                  ["bmi", tr("BMI حسب الطول المحفوظ")],
                  ["strength", tr("تطور حمل التمرين")],
                ].map(([key, label]) => (
                  <option key={key} value={key}>
                    {tr(label)}
                  </option>
                ))}
              </select>
            </label>
            {metric === "strength" && (
              <label className="flex-1">
                {tr("التمرين")}
                <select
                  className="field"
                  value={exerciseName || exerciseNames[0] || ""}
                  onChange={(event) => setExerciseName(event.target.value)}
                >
                  {exerciseNames.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <ProgressChart
            points={points}
            target={metric === "weight" ? targetWeight : undefined}
            unit={
              metric === "body_fat"
                ? "%"
                : metric === "bmi"
                  ? ""
                  : metric === "weight" || metric === "strength"
                    ? tr("كجم")
                    : tr("سم")
            }
            title={tr("تطور القياسات عبر الزمن")}
          />
          <RecordForm
            clientId={clientId}
            kind="measurement"
            busy={busy}
            onSubmit={(payload) => action("record_save", payload)}
            photos={management?.progress_photos ?? []}
          />
          <section className="card p-5">
            <h3>{tr("السجل التاريخي للقياسات")}</h3>
            <p className="text-sm text-muted mt-1">
              {tr(
                "السجلات الجديدة لا تستبدل القديمة. يتم عرض أحدث قيمة لكل يوم في الرسم.",
              )}
            </p>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>{tr("التاريخ")}</th>
                    <th>{tr("القيم")}</th>
                  </tr>
                </thead>
                <tbody>
                  {measurements
                    .slice(recordPage * 20, recordPage * 20 + 20)
                    .map((record) => (
                      <tr key={record.id}>
                        <td>{record.entry_date}</td>
                        <td className="text-sm">
                          {Object.entries(record.payload)
                            .filter(
                              ([key, value]) =>
                                key !== "historical_only" && value !== "",
                            )
                            .map(([key, value]) =>
                              key === "custom"
                                ? Object.entries(
                                    value as Record<string, number>,
                                  )
                                    .map(([name, value]) => `${name}: ${value}`)
                                    .join(" · ")
                                : `${tr(measurementLabels[key] ?? key)}: ${value}`,
                            )
                            .join(" · ")}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                className="btn-secondary"
                disabled={!recordPage}
                onClick={() => setRecordPage(recordPage - 1)}
              >
                {tr("السابق")}
              </button>
              <button
                className="btn-secondary"
                disabled={(recordPage + 1) * 20 >= measurements.length}
                onClick={() => setRecordPage(recordPage + 1)}
              >
                {tr("التالي")}
              </button>
            </div>
          </section>
        </>
      )}
      {tab === "nutrition" && (
        <>
          <section className="card p-5">
            <div className="section-title">
              <h2>{tr("الأهداف الحالية مقابل التسجيل الفعلي")}</h2>
              {coach && (
                <button
                  className="btn-secondary"
                  disabled={busy || !currentTarget}
                  onClick={async () => {
                    const name = window.prompt("اسم قالب التغذية");
                    if (!name || !currentTarget) return;
                    setBusy(true);
                    const plan = structuredClone(blankContent);
                    plan.nutrition = {
                      ...plan.nutrition,
                      ...currentTarget,
                    } as typeof plan.nutrition;
                    const saved = await mutate("template_save", {
                      name,
                      content: plan,
                    });
                    if (saved.ok)
                      await action("template_meta", {
                        id: (saved.data as { id: string }).id,
                        description: "",
                        archived: false,
                        kind: "nutrition",
                      });
                    else setResult(saved);
                    setBusy(false);
                  }}
                >
                  <Plus size={16} />
                  {tr("حفظ هدف التغذية كقالب")}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["calories", tr("السعرات")],
                ["protein", tr("البروتين")],
                ["carbs", tr("الكارب")],
                ["fat", tr("الدهون")],
              ].map(([key, label]) => (
                <div className="rounded-lg bg-canvas p-3" key={key}>
                  <p className="text-xs text-muted">{tr(label)}</p>
                  <strong>
                    {String(
                      currentTarget?.[key as keyof typeof currentTarget] ?? "—",
                    )}
                  </strong>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto mt-4">
              <table>
                <thead>
                  <tr>
                    <th>{tr("اليوم")}</th>
                    <th>{tr("السعرات الفعلية / الهدف")}</th>
                    <th>{tr("البروتين")}</th>
                    <th>{tr("الكارب")}</th>
                    <th>{tr("الدهون")}</th>
                  </tr>
                </thead>
                <tbody>
                  {actual
                    .slice(-30)
                    .reverse()
                    .map((record) => {
                      const target =
                        targets.find(
                          (target) => target.entry_date <= record.entry_date,
                        )?.payload ?? program?.content.nutrition;
                      return (
                        <tr key={record.id}>
                          <td>{record.entry_date}</td>
                          <td>
                            {String(record.payload.calories)} /{" "}
                            {String(target?.calories ?? "—")}
                          </td>
                          <td>
                            {String(record.payload.protein)} /{" "}
                            {String(target?.protein ?? "—")}
                          </td>
                          <td>
                            {String(record.payload.carbs)} /{" "}
                            {String(target?.carbs ?? "—")}
                          </td>
                          <td>
                            {String(record.payload.fat)} /{" "}
                            {String(target?.fat ?? "—")}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {!actual.length && (
              <p className="text-sm text-muted mt-4">
                {tr(
                  "لا توجد تسجيلات فعلية بعد؛ غياب السجل لا يعني ضعف الالتزام.",
                )}
              </p>
            )}
          </section>
          <RecordForm
            clientId={clientId}
            kind="nutrition_log"
            busy={busy}
            onSubmit={(payload) => action("record_save", payload)}
          />
          {coach && (
            <RecordForm
              clientId={clientId}
              kind="nutrition_target"
              busy={busy}
              onSubmit={(payload) => action("record_save", payload)}
            />
          )}
          <section className="card p-5">
            <h3>{tr("تاريخ تغييرات الأهداف")}</h3>
            {targets.map((record) => (
              <p className="text-sm border-b py-3" key={record.id}>
                {record.entry_date} · {String(record.payload.calories)}{" "}
                {tr("سعرة · P")} {String(record.payload.protein)} · C{" "}
                {String(record.payload.carbs)} · F {String(record.payload.fat)}
              </p>
            ))}
          </section>
        </>
      )}
      {tab === "workouts" && (
        <>
          <RecordForm
            clientId={clientId}
            kind="workout_log"
            busy={busy}
            program={program}
            onSubmit={(payload) => action("record_save", payload)}
          />
          <div className="card p-5">
            <h2>{tr("الحصص المسجلة")}</h2>
            {records
              .filter((record) => record.kind === "workout_log")
              .slice(workoutPage * 20, workoutPage * 20 + 20)
              .map((record) => (
                <article key={record.id} className="border-b py-3">
                  <strong>
                    {record.entry_date} · {String(record.payload.day_name)}
                  </strong>
                  <p className="text-sm text-muted">
                    {record.payload.completed
                      ? tr("الحصة مكتملة")
                      : tr("لم تكتمل الحصة")}{" "}
                    · {String(record.payload.notes ?? "")}
                  </p>
                  {(
                    (record.payload.exercises as Array<{
                      name: string;
                      sets: number;
                      reps: string;
                      weight?: number;
                    }>) ?? []
                  ).map((exercise, index) => (
                    <p key={index} className="text-sm mt-1">
                      {exercise.name} · {exercise.sets} × {exercise.reps}
                      {exercise.weight !== undefined
                        ? tr(" · {0} كجم", String(exercise.weight))
                        : ""}
                    </p>
                  ))}
                </article>
              ))}
            <div className="flex gap-2 my-4">
              <button
                className="btn-secondary"
                disabled={!workoutPage}
                onClick={() => setWorkoutPage(workoutPage - 1)}
              >
                {tr("السابق")}
              </button>
              <button
                className="btn-secondary"
                disabled={
                  (workoutPage + 1) * 20 >=
                  records.filter((r) => r.kind === "workout_log").length
                }
                onClick={() => setWorkoutPage(workoutPage + 1)}
              >
                {tr("التالي")}
              </button>
            </div>
            {records
              .filter((record) => record.kind === "program_history")
              .map((record) => (
                <article key={record.id} className="border-b py-3">
                  <strong>
                    {record.entry_date} · {String(record.payload.name)}
                  </strong>
                  <span className="badge ms-2">
                    {tr("برنامج مستورد محفوظ تاريخيًا")}
                  </span>
                  {coach && (
                    <button
                      className="btn-secondary mt-2"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "استخدام هذا البرنامج كمسودة؟ ستبقى النسخة المنشورة الحالية كما هي حتى تنشر.",
                          )
                        )
                          return;
                        const response = await mutate("program_save", {
                          client_id: clientId,
                          name: record.payload.name,
                          content: record.payload.content,
                        });
                        setResult(response);
                        if (response.ok) await refresh();
                      }}
                    >
                      {tr("نسخ البرنامج التاريخي إلى المسودة")}
                    </button>
                  )}
                </article>
              ))}
          </div>
        </>
      )}
      {tab === "checkins" && (
        <>
          <RecordForm
            clientId={clientId}
            kind="checkin"
            busy={busy}
            onSubmit={(payload) => action("record_save", payload)}
            photos={management?.progress_photos ?? []}
          />
          <section className="card p-5">
            <h2>{tr("المراجعات والمقارنة الأسبوعية")}</h2>
            {!checkins.length && (
              <p className="text-sm text-muted mt-3">
                {tr("لم تُرسل مراجعة أسبوعية بعد.")}
              </p>
            )}
            {checkins.map((record, index) => (
              <article key={record.id} className="border-b py-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <strong>{record.entry_date}</strong>
                  <span className="badge">
                    {record.reviewed_at
                      ? tr("تمت المراجعة")
                      : tr("بانتظار المراجعة")}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-sm sm:grid-cols-3">
                  {[
                    ["weight", tr("الوزن")],
                    ["sleep", tr("النوم")],
                    ["energy", tr("الطاقة")],
                    ["hunger", tr("الجوع")],
                    ["stress", tr("التوتر")],
                    ["training_adherence", tr("التزام التدريب %")],
                    ["nutrition_adherence", tr("التزام التغذية %")],
                  ].map(([key, label]) => (
                    <p key={key}>
                      {tr(label)}:{" "}
                      <strong>{String(record.payload[key] ?? "—")}</strong>
                    </p>
                  ))}
                </div>
                {typeof record.payload.weight === "number" &&
                  typeof checkins[index + 1]?.payload.weight === "number" && (
                    <p className="text-sm mt-2">
                      {tr("التغير عن المراجعة السابقة:")}{" "}
                      {(
                        record.payload.weight -
                        Number(checkins[index + 1].payload.weight)
                      ).toFixed(1)}{" "}
                      {tr("كجم")}
                    </p>
                  )}
                <p className="mt-3 text-sm whitespace-pre-wrap">
                  {String(record.payload.feedback ?? "")}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">
                  {String(record.payload.questions ?? "")}
                </p>
                {record.coach_feedback && (
                  <div className="bg-accent rounded-lg p-3 text-sm mt-3">
                    <strong>{tr("رد المدرب")}</strong>
                    <p className="whitespace-pre-wrap mt-1">
                      {record.coach_feedback}
                    </p>
                  </div>
                )}
                {coach && (
                  <form
                    className="mt-3"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      await action("record_review", {
                        id: record.id,
                        feedback: String(
                          new FormData(event.currentTarget).get("feedback") ??
                            "",
                        ),
                        reviewed: true,
                      });
                    }}
                  >
                    <label>
                      {tr("رد وملاحظات المراجعة")}
                      <textarea
                        name="feedback"
                        className="field"
                        maxLength={4000}
                        defaultValue={record.coach_feedback}
                      />
                    </label>
                    <button className="btn-secondary mt-2" disabled={busy}>
                      <Check size={16} />
                      {tr("حفظ الرد ووضع تمت المراجعة")}
                    </button>
                  </form>
                )}
              </article>
            ))}
          </section>
        </>
      )}
      {tab === "messages" && (
        <>
          <section className="card p-5">
            <div className="section-title">
              <h2>{tr("المراسلات داخل المنصة")}</h2>
              <div className="flex flex-wrap gap-2">
                {!coach && showRenewalRequest && <button type="button" className="btn" disabled={busy || renewalRequested} onClick={async () => {
                  if (!renewalRequest.current || renewalRequest.current.clientId !== clientId) renewalRequest.current = {
                    clientId, id: crypto.randomUUID(), day: riyadhToday(),
                    text: tr("أرغب في تجديد اشتراكي. تواصل معي من فضلك لمناقشة المدة والتكلفة."),
                  };
                  const request = renewalRequest.current;
                  const response = await action("record_save", {
                    id: request.id,
                    client_id: clientId,
                    kind: "message",
                    entry_date: request.day,
                    payload: { text: request.text },
                  });
                  if (response.ok) setRenewalRequestedFor(clientId);
                }}>{tr(renewalRequested ? "تم إرسال طلب التجديد" : busy ? "جارٍ إرسال الطلب…" : "طلب تجديد الاشتراك")}</button>}
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => action("messages_read", { client_id: clientId })}
                >
                  {tr("تحديد المحادثة كمقروءة")}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted">
              {tr("هذه مراسلة داخل حسابك؛ لا تُرسل بريدًا أو رسالة واتساب.")}
            </p>
            <div className="space-y-3 mt-4 max-h-[32rem] overflow-y-auto">
              {records
                .filter((record) => record.kind === "message")
                .slice()
                .reverse()
                .map((record) => (
                  <article
                    key={record.id}
                    className={`max-w-[90%] rounded-lg p-3 ${record.author_type === (coach ? "coach" : "client") ? "bg-accent ms-auto" : "bg-canvas me-auto"}`}
                  >
                    <p className="text-sm whitespace-pre-wrap">
                      {String(record.payload.text)}
                    </p>
                    <small className="block mt-2 text-muted">
                      {record.author_type === "coach"
                        ? tr("المدرب")
                        : tr("المتدرب")}{" "}
                      · {record.entry_date} ·{" "}
                      {record.read_at ? tr("مقروءة") : tr("جديدة")}
                    </small>
                  </article>
                ))}
              {!records.some((record) => record.kind === "message") && (
                <p className="text-sm text-muted">
                  {tr("ابدأ محادثة مع مدربك أو عميلك.")}
                </p>
              )}
            </div>
          </section>
          <RecordForm
            clientId={clientId}
            kind="message"
            busy={busy}
            onSubmit={(payload) => action("record_save", payload)}
          />
        </>
      )}
      {tab === "notes" && coach && (
        <>
          <RecordForm
            clientId={clientId}
            kind="note"
            busy={busy}
            onSubmit={(payload) => action("record_save", payload)}
          />
          <section className="card p-5">
            <h2>{tr("ملاحظات خاصة بالمدرب")}</h2>
            <p className="text-sm text-muted">
              {tr("لا تظهر للمتدرب أو في تصديره.")}
            </p>
            {records
              .filter((record) => record.kind === "note")
              .map((record) => (
                <article key={record.id} className="border-b py-3">
                  <small>{record.entry_date}</small>
                  <p className="whitespace-pre-wrap text-sm mt-1">
                    {String(record.payload.text)}
                  </p>
                </article>
              ))}
          </section>
        </>
      )}
      {tab === "photos" && (
        <ProgressPhotos
          clientId={clientId}
          photos={management?.progress_photos ?? []}
          portalToken={portalToken}
          portalHash={portalHash}
          onUpdate={refresh}
          coach={coach}
          measurements={measurements}
          weights={weights.filter((weight) => weight.client_id === clientId)}
        />
      )}
      <Notice result={result} />
      {!portalToken && (
        <Link
          prefetch={false}
          className="btn-secondary"
          href="/api/export?type=xlsx"
        >
          <Download size={17} />
          {tr("تصدير بياناتي إلى Excel")}
        </Link>
      )}
    </section>
  );
}

function RecordForm({
  clientId,
  kind,
  onSubmit,
  busy,
  program,
  photos = [],
}: {
  clientId: string;
  kind: RecordKind;
  onSubmit: (payload: unknown) => Promise<Result>;
  busy: boolean;
  program?: Program;
  photos?: ManagementData["progress_photos"];
}) {
  const { t: tr } = useLocale();

  const requestId = useRef<string | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [localError, setLocalError] = useState("");
  const exerciseRows = program?.content.days[dayIndex]?.exercises ?? [];
  const fields =
    kind === "measurement"
      ? [
          ["weight", "الوزن (كجم)", 20, 400],
          ["body_fat", "نسبة الدهون %", 0, 100],
          ["waist", "الخصر (سم)", 1, 300],
          ["chest", "الصدر (سم)", 1, 300],
          ["arm", "الذراع (سم)", 1, 200],
          ["thigh", "الفخذ (سم)", 1, 200],
          ["hips", "الحوض (سم)", 1, 300],
          ["calf", "الساق (سم)", 1, 120],
        ]
      : kind === "checkin"
        ? [
            ["weight", "الوزن (كجم)", 20, 400],
            ["sleep", "جودة النوم 1–5", 1, 5],
            ["energy", "الطاقة 1–5", 1, 5],
            ["hunger", "الجوع 1–5", 1, 5],
            ["stress", "التوتر 1–5", 1, 5],
            ["training_adherence", "التزام التدريب %", 0, 100],
            ["nutrition_adherence", "التزام التغذية %", 0, 100],
          ]
        : kind === "nutrition_log" || kind === "nutrition_target"
          ? [
              ["calories", "السعرات", 0, 10000],
              ["protein", "البروتين (غ)", 0, 1000],
              ["carbs", "الكارب (غ)", 0, 1000],
              ["fat", "الدهون (غ)", 0, 1000],
            ]
          : [];
  return (
    <form
      className="card p-5"
      data-record-kind={kind}
      onSubmit={async (event) => {
        event.preventDefault();
        setLocalError("");
        const form = event.currentTarget,
          values = new FormData(form);
        try {
          const payload: Record<string, unknown> = {};
          for (const [key] of fields) {
            const value = values.get(String(key));
            if (value !== null && value !== "")
              payload[String(key)] = Number(value);
          }
          if (kind === "note" || kind === "message")
            payload.text = String(values.get("text") ?? "");
          else if (kind === "checkin") {
            payload.feedback = String(values.get("feedback") ?? "");
            payload.questions = String(values.get("questions") ?? "");
            payload.photo_ids = values.getAll("photo_ids");
          } else if (kind === "workout_log") {
            payload.day_name = String(values.get("day_name") ?? "");
            payload.completed = values.get("completed") === "on";
            payload.notes = String(values.get("notes") ?? "");
            if (program) payload.program_id = program.id;
            payload.exercises = exerciseRows.length
              ? exerciseRows.map((exercise, index) => ({
                  name: exercise.name,
                  sets: Number(values.get(`sets-${index}`)),
                  reps: String(values.get(`reps-${index}`) ?? ""),
                  ...(values.get(`weight-${index}`) !== ""
                    ? { weight: Number(values.get(`weight-${index}`)) }
                    : {}),
                  ...(values.get(`rpe-${index}`) !== ""
                    ? { rpe: Number(values.get(`rpe-${index}`)) }
                    : {}),
                }))
              : [];
          } else if (kind === "nutrition_target") {
            payload.text = String(values.get("text") ?? "");
          } else {
            payload.notes = String(values.get("notes") ?? "");
            if (kind === "measurement") {
              if (
                !Object.keys(payload).some((key) => key !== "notes") &&
                !values.get("custom")
              )
                throw Error("أدخل قياسًا واحدًا على الأقل");
              const custom = String(values.get("custom") ?? "")
                .split(/\r?\n/)
                .filter(Boolean);
              if (custom.length) {
                payload.custom = Object.fromEntries(
                  custom.map((line) => {
                    const [key, value] = line.split("=");
                    if (
                      !key?.trim() ||
                      !value ||
                      !Number.isFinite(Number(value))
                    )
                      throw Error("صيغة القياس المخصص: الاسم=القيمة");
                    return [key.trim(), Number(value)];
                  }),
                );
              }
            }
          }
          const result = await onSubmit({
            id: (requestId.current ??= crypto.randomUUID()),
            client_id: clientId,
            kind,
            entry_date: String(values.get("entry_date")),
            payload,
          });
          if (result.ok) {
            requestId.current = null;
            form.reset();
          }
        } catch (error) {
          setLocalError(
            error instanceof Error ? error.message : "بيانات غير صالحة",
          );
        }
      }}
    >
      <fieldset disabled={busy} className="min-w-0">
      <h2>
        {kind === "measurement"
          ? tr("إضافة قياس مؤرخ")
          : kind === "nutrition_log"
            ? tr("تسجيل الماكروز الفعلية")
            : kind === "nutrition_target"
              ? tr("تحديث أهداف التغذية بتاريخ سريان")
              : kind === "workout_log"
                ? tr("تسجيل أداء حصة")
                : kind === "checkin"
                  ? tr("إرسال مراجعة أسبوعية")
                  : kind === "note"
                    ? tr("إضافة ملاحظة خاصة")
                    : tr("رسالة جديدة")}
      </h2>
      <div className="grid gap-3 mt-4 sm:grid-cols-2 lg:grid-cols-3">
        <label>
          {tr("تاريخ السجل")}
          <input
            aria-label={tr("تاريخ ") + tr(labels[kind])}
            name="entry_date"
            type="date"
            className="field"
            defaultValue={riyadhToday()}
            max={kind === "nutrition_target" ? undefined : riyadhToday()}
            required
          />
        </label>
        {fields.map(([key, label, min, max]) => (
          <label key={String(key)}>
            {tr(label)}
            <input
              className="field"
              name={String(key)}
              aria-label={tr(String(label))}
              type="number"
              step={
                ["sleep", "energy", "hunger", "stress"].includes(String(key))
                  ? 1
                  : ".1"
              }
              min={Number(min)}
              max={Number(max)}
              required={kind !== "measurement" && key !== "weight"}
            />
          </label>
        ))}
      </div>
      {kind === "measurement" && (
        <label className="mt-3">
          {tr("قياسات إضافية — كل سطر: الاسم=القيمة")}
          <textarea
            name="custom"
            className="field"
            maxLength={1000}
            placeholder={tr("الرقبة=38")}
          />
        </label>
      )}
      {kind === "workout_log" && (
        <>
          <label className="mt-3">
            {tr("اليوم التدريبي")}
            {program ? (
              <>
                <select
                  className="field"
                  aria-label={tr("الحصة المسجلة")}
                  value={dayIndex}
                  onChange={(event) => setDayIndex(Number(event.target.value))}
                >
                  {program.content.days.map((day, index) => (
                    <option key={index} value={index}>
                      {day.name}
                    </option>
                  ))}
                </select>
                <input
                  type="hidden"
                  name="day_name"
                  value={program.content.days[dayIndex]?.name ?? ""}
                />
              </>
            ) : (
              <input name="day_name" className="field" required />
            )}
          </label>
          <label className="flex gap-2 items-center mt-3">
            <input type="checkbox" name="completed" />
            {tr("أكملت الحصة")}
          </label>
          {exerciseRows.map((exercise, index) => (
            <div key={index} className="border rounded-lg p-3 mt-3">
              <strong className="text-sm">{exercise.name}</strong>
              <div className="grid grid-cols-2 gap-2 mt-2 lg:grid-cols-4">
                {[
                  ["sets", tr("المجموعات"), exercise.sets],
                  ["reps", tr("العدات"), exercise.reps],
                  ["weight", tr("الوزن (كجم)"), ""],
                  ["rpe", "RPE", ""],
                ].map(([key, label, value]) => (
                  <label key={String(key)} className="text-xs">
                    {tr(label)}
                    <input
                      name={`${key}-${index}`}
                      className="field"
                      type={key === "reps" ? "text" : "number"}
                      min={0}
                      max={
                        key === "weight"
                          ? 1500
                          : key === "rpe"
                            ? 10
                            : key === "sets"
                              ? 100
                              : undefined
                      }
                      step={
                        key === "reps" ? undefined : key === "sets" ? 1 : 0.5
                      }
                      defaultValue={value}
                      required={key === "sets" || key === "reps"}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
      {kind === "checkin" ? (
        <>
          <label className="mt-3">
            {tr("ملاحظات الأسبوع")}
            <textarea name="feedback" className="field" maxLength={4000} />
          </label>
          <label className="mt-3">
            {tr("أسئلة أو صعوبات")}
            <textarea name="questions" className="field" maxLength={4000} />
          </label>
          {photos.some((photo) => photo.client_id === clientId) && (
            <fieldset className="mt-3">
              <legend>{tr("إرفاق صور سبق رفعها في تبويب صور التقدم")}</legend>
              {photos
                .filter((photo) => photo.client_id === clientId)
                .slice(0, 12)
                .map((photo) => (
                  <label key={photo.id} className="flex gap-2 text-sm">
                    <input type="checkbox" name="photo_ids" value={photo.id} />
                    {photo.entry_date} · {photo.filename}
                  </label>
                ))}
            </fieldset>
          )}
        </>
      ) : (
        <label className="mt-3">
          {kind === "message"
            ? tr("الرسالة")
            : kind === "note"
              ? tr("ملاحظة خاصة")
              : kind === "nutrition_target"
                ? tr("خطة الوجبات أو توجيهات التغذية")
                : tr("ملاحظات السجل")}
          <textarea
            className="field"
            name={
              ["message", "note", "nutrition_target"].includes(kind)
                ? "text"
                : "notes"
            }
            maxLength={4000}
            required={kind === "message" || kind === "note"}
          />
        </label>
      )}
      <button className="btn mt-4" disabled={busy}>
        {kind === "message" ? <Send size={17} /> : <Plus size={17} />}
        {tr("حفظ")} {tr(labels[kind])}
      </button>
      {localError && (
        <p role="alert" className="text-red-700 mt-3 text-sm">
          {localError}
        </p>
      )}
      </fieldset>
    </form>
  );
}
