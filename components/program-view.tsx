"use client";
import { useLocale } from "./locale-provider";
import { ExerciseVisual } from "./exercise-visual";
import { catalogById, exerciseName } from "@/lib/catalog";
import type { Program, Content } from "@/lib/model";
import { formatDate } from "@/lib/dates";
import { Play, Timer, Utensils } from "lucide-react";
import { useState } from "react";
import { riyadhToday } from "@/lib/dates";
import { resolveWorkoutDay } from "@/lib/trainee-workout-day";
import { MacroSplitBar } from "./macro-targets";
export function ProgramView({
  program,
  portalHash,
  nutrition,
  focusToday = false,
  section = "all",
}: {
  program: Program | undefined;
  portalHash?: string;
  nutrition?: Content["nutrition"];
  focusToday?: boolean;
  /** Lets the trainee page place training and nutrition separately (mobile priority order). */
  section?: "all" | "training" | "nutrition";
}) {
  const { t: tr, language: locale } = useLocale();
  const weekday = new Date(riyadhToday() + "T12:00:00Z").getUTCDay();
  const scheduledIndex = program?.content.days.findIndex((day) => day.weekday === weekday) ?? -1;
  const hasWeekdaySchedule = Boolean(program?.content.days.some((day) => day.weekday !== undefined));
  const [chosenDay, setSelectedDay] = useState<number | null>(null);
  const selectedDay = resolveWorkoutDay(chosenDay, program?.content.days ?? [], weekday);
  const nutritionPlan = section === "training" ? undefined : nutrition ?? program?.content.nutrition;
  return (
    <div className="space-y-6">
      {section === "nutrition" ? null : !program ? (
      <div className="empty card">
        <h2 className="text-ink">{tr("برنامجك قيد التجهيز")}</h2>
        <p>{tr("سيظهر هنا بعد أن ينشره مدربك. المسودات لا تظهر لك.")}</p>
      </div>
      ) : <>
      <div className="card p-6">
        <span className="badge bg-accent/40 text-teal">
          {tr("آخر نسخة منشورة")}
        </span>
        <h2 className="mt-3 text-xl">{program.name}</h2>
        <p className="mt-1 text-xs text-muted">
          {tr("نُشر")} {formatDate(program.published_at!, locale)}{" "}
          {tr("· النسخة")} {program.version}
        </p>
      </div>
      {focusToday && program.content.days.length > 0 && <section className="card p-4" aria-label={tr("أيام البرنامج الأسبوعية")}>
        {!hasWeekdaySchedule && <p className="mb-3 text-sm text-muted">{tr("لم يحدد المدرب مواعيد لأيام البرنامج؛ اختر اليوم الذي تريد عرضه.")}</p>}
        <div className="flex flex-wrap gap-2">{program.content.days.map((day, index) => <button type="button" key={index} className={selectedDay === index ? "btn" : "btn-secondary"} aria-pressed={selectedDay === index} onClick={() => setSelectedDay(index)}>{day.name}</button>)}</div>
        <p className="mt-3 text-sm text-muted">{selectedDay === -1 && hasWeekdaySchedule ? tr("لا توجد حصة مبرمجة اليوم؛ يوم راحة حسب جدولك.") : scheduledIndex === selectedDay ? tr("تم تحديد حصة اليوم حسب جدولك.") : tr("عرض يوم البرنامج: ") + (program.content.days[selectedDay]?.name ?? "")}</p>
      </section>}
      {program.content.days.map((day, index) => (!focusToday || selectedDay === index) && (
        <section className="card overflow-hidden" key={index}>
          <div className="flex items-center gap-3 border-b bg-canvas/50 px-6 py-4">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent/40 text-sm font-bold text-teal">
              {index + 1}
            </span>
            <h2>{day.name}</h2>
          </div>
          <div className="divide-y divide-line">
            {day.exercises.map((e, i) => (
              <article key={i} className="p-6">
                {e.catalogId && catalogById.has(e.catalogId) ? (
                  <div className="program-movement">
                    <ExerciseVisual
                      key={e.catalogId}
                      exercise={catalogById.get(e.catalogId)!}
                      playable
                      portalHash={portalHash}
                    />
                    <div>
                      <p className="eyebrow">
                        {tr("التمرين")} {i + 1}
                      </p>
                      <h3>
                        {exerciseName(catalogById.get(e.catalogId)!, locale)}
                      </h3>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {e.catalogId &&
                      catalogById.get(e.catalogId)?.name === e.name
                        ? exerciseName(catalogById.get(e.catalogId)!, locale)
                        : e.name}
                    </h3>
                  </div>
                  {e.video ? (
                    <a
                      href={e.video}
                      rel="noopener noreferrer"
                      target="_blank"
                      className="btn-secondary"
                    >
                      <Play size={14} />
                      {tr("فيديو التمرين")}
                    </a>
                  ) : null}
                </div>
                {e.mediaId ? (
                  <video
                    controls
                    playsInline
                    preload="none"
                    className="mt-4 max-h-80 w-full rounded bg-black"
                    src={
                      "/api/media/" +
                      e.mediaId +
                      (portalHash ? "?portal=" + portalHash : "")
                    }
                  />
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <span className="badge">
                    {e.sets} {tr("مجموعات")}
                  </span>
                  <span className="badge">
                    {e.reps} {tr("عدات")}
                  </span>
                  {e.weight !== undefined && (
                    <span className="badge">
                      {e.weight} {tr("كجم")}
                    </span>
                  )}
                  {e.rpe !== undefined && (
                    <span className="badge">RPE {e.rpe}</span>
                  )}
                  {e.rir !== undefined && (
                    <span className="badge">RIR {e.rir}</span>
                  )}
                  {e.tempo && (
                    <span className="badge">
                      {tr("الإيقاع")} {e.tempo}
                    </span>
                  )}
                  <span className="badge">
                    <Timer size={12} />
                    {e.rest} {tr("ثانية راحة")}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      </>}
      {nutritionPlan && <section className="card p-6">
        <h2 className="flex items-center gap-2">
          <Utensils size={20} className="text-teal" />
          {tr("خطة التغذية")}
        </h2>
        <div className="my-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [tr("السعرات"), nutritionPlan.calories, tr("سعرة")],
            [tr("البروتين"), nutritionPlan.protein, tr("غ")],
            [tr("الكاربوهيدرات"), nutritionPlan.carbs, tr("غ")],
            [tr("الدهون"), nutritionPlan.fat, tr("غ")],
          ].map(([name, value, unit]) => (
            <div key={String(name)} className="rounded-xl bg-canvas p-4">
              <p className="text-xs text-muted">{name}</p>
              <p className="mt-1 text-xl font-semibold">
                <bdi dir="ltr">{value || "—"}</bdi>{" "}
                <span className="text-xs font-normal text-muted">{unit}</span>
              </p>
            </div>
          ))}
        </div>
        <MacroSplitBar value={nutritionPlan} className="mb-5" />
        <p className="whitespace-pre-wrap leading-9 text-muted">
          {nutritionPlan.text || tr("لم يضف المدرب خطة تغذية نصية بعد.")}
        </p>
        {nutritionPlan.meals?.length ? (
          <div className="mt-6 space-y-3">
            {nutritionPlan.meals.map((m, i) => (
              <article key={i} className="meal-card">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold">{m.name}</h3>
                  <span className="text-xs text-muted">{m.time}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-8">
                  {m.foods}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="badge">
                    {m.calories} {tr("سعرة")}
                  </span>
                  <span className="badge">
                    {tr("بروتين")} {m.protein} {tr("غ")}
                  </span>
                  <span className="badge">
                    {tr("كارب")} {m.carbs} {tr("غ")}
                  </span>
                  <span className="badge">
                    {tr("دهون")} {m.fat} {tr("غ")}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>}
    </div>
  );
}
