"use client";
import { useId, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, Dumbbell, Timer } from "lucide-react";
import { useLocale } from "./locale-provider";
import { ExerciseVideo, ExerciseVideoLink } from "./exercise-video";
import { ChunkLoading } from "./chunk-loading";
import { VisitedPanel } from "./visited-panel";
import { catalogById, exerciseName } from "@/lib/catalog";
import { displayDayName } from "@/lib/program-builder";
import { formatDate, riyadhToday } from "@/lib/dates";
import { countLabel, nouns } from "@/lib/plural";
import type { Program } from "@/lib/model";
const weekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const ExerciseVisual = dynamic(() => import("./exercise-visual").then(m => m.ExerciseVisual), { loading: ChunkLoading });
const WorkoutSessionForm = dynamic(() => import("./workout-session-form").then(m => m.WorkoutSessionForm), { loading: ChunkLoading });

export function WeeklyProgram({ program, portalHash, clientId }: { program: Program; portalHash?: string; clientId?: string }) {
  const { t: tr, language } = useLocale();
  const id = useId();
  const today = new Date(riyadhToday() + "T12:00:00Z").getUTCDay();
  const scheduled = program.content.days.findIndex(day => day.weekday === today);
  const hasSchedule = program.content.days.some(day => day.weekday !== undefined);
  const initial = scheduled >= 0 ? scheduled : hasSchedule ? -1 : 0;
  const [openDays, setOpenDays] = useState(() => new Set([initial]));
  const [logging, setLogging] = useState<number | null>(null);
  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(() => new Set());
  const dayLabel = (name: string, index: number) => {
    const label = displayDayName(name, language);
    return program.content.days.filter(day => displayDayName(day.name, language) === label).length > 1 ? `${label} (${index + 1})` : label;
  };
  const openDay = (index: number) => {
    setOpenDays(current => new Set([...current, index]));
    requestAnimationFrame(() => document.getElementById(`${id}-day-${index}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  return <div className="weekly-program space-y-4" data-testid="weekly-program">
    <header className="card p-5">
      <span className="badge">{tr("آخر نسخة منشورة")}</span><h2 className="mt-3 text-xl">{program.name}</h2>
      <p className="mt-2 text-xs text-muted">{tr("نُشر")} {formatDate(program.published_at!, language)} {tr("· النسخة")} <bdi dir="ltr">{program.publication_number ?? 1}</bdi></p>
      <h3 className="mt-5">{tr("الجدول كامل")}</h3>
      <p className="mt-2 text-sm text-muted">{!hasSchedule ? tr("لم يحدد المدرب مواعيد لأيام البرنامج؛ اختر اليوم الذي تريد عرضه.") : scheduled < 0 ? tr("لا توجد حصة مبرمجة اليوم؛ يوم راحة حسب جدولك.") : tr("تم تحديد حصة اليوم حسب جدولك.")}</p>
      <div className="weekly-quick-days mt-4" aria-label={tr("أيام البرنامج الأسبوعية")}>
        {program.content.days.map((day, index) => <button type="button" className={openDays.has(index) ? "btn" : "btn-secondary"} aria-pressed={openDays.has(index)} key={index} data-day-jump={index} onClick={() => openDay(index)}>
          <span>{dayLabel(day.name, index)}</span><small>{day.weekday === undefined ? tr("بدون يوم محدد") : tr(weekdays[day.weekday])} · {countLabel(language, day.exercises.length, nouns.exercise)}</small>
        </button>)}
      </div>
    </header>
    {program.content.days.map((day, index) => <details id={`${id}-day-${index}`} key={`${program.id}-${index}`} data-program-day={index} className={`card weekly-day ${scheduled === index ? "is-today" : ""}`} open={openDays.has(index)} onToggle={event => {
      const opened = event.currentTarget.open;
      setOpenDays(current => { if (current.has(index) === opened) return current; const next = new Set(current); if (opened) next.add(index); else next.delete(index); return next; });
    }}>
      <summary className="weekly-day-heading"><span><strong>{dayLabel(day.name, index)}</strong><small>{day.weekday === undefined ? tr("بدون يوم محدد") : tr(weekdays[day.weekday])} · {countLabel(language, day.exercises.length, nouns.exercise)}</small><span className="weekly-day-preview">{day.exercises.map(exercise => exercise.name).join(" · ") || tr("لا توجد تمارين لهذا اليوم بعد.")}</span></span>{scheduled === index && <span className="badge">{tr("اليوم")}</span>}<ChevronDown className="weekly-chevron" size={18}/></summary>
      <div className="weekly-day-content">
        {!day.exercises.length && <p role="status" className="empty">{tr("لا توجد تمارين لهذا اليوم بعد.")}</p>}
        {day.exercises.map((exercise, row) => {
          const catalog = exercise.catalogId ? catalogById.get(exercise.catalogId) : undefined;
          const name = catalog && catalog.name === exercise.name ? exerciseName(catalog, language) : exercise.name;
          const mediaKey = `${index}:${row}`;
          return <details className="weekly-exercise" key={exercise.rowId ?? row} data-workout-exercise={row} onToggle={event => {
            if (event.currentTarget.open) setExpandedExercises(current => current.has(mediaKey) ? current : new Set([...current, mediaKey]));
          }}>
            <summary><span className="exercise-order"><Dumbbell size={19}/><bdi dir="ltr">{row + 1}</bdi></span><span><strong>{name}</strong><small><bdi dir="ltr">{exercise.sets} × {exercise.reps}</bdi> · <Timer size={12}/> <bdi dir="ltr">{exercise.rest}</bdi> {tr("ثانية راحة")}</small></span><ChevronDown className="weekly-chevron" size={18}/></summary>
            <div className="weekly-exercise-body">
              <VisitedPanel active={expandedExercises.has(mediaKey)}>{catalog ? <ExerciseVisual exercise={catalog} playable portalHash={portalHash}/> : <div className="exercise-art-fallback"><Dumbbell size={42}/><p>{name}</p><small>{tr("اتبع توجيهات مدربك لهذا التمرين")}</small></div>}</VisitedPanel>
              {exercise.coachNotes && <p className="whitespace-pre-wrap leading-8">{exercise.coachNotes}</p>}
              <VisitedPanel active={expandedExercises.has(mediaKey)}>{exercise.mediaId && <ExerciseVideo src={`/api/media/${exercise.mediaId}${portalHash ? `?portal=${portalHash}` : ""}`} label={name}/>}
              {exercise.video && <ExerciseVideoLink url={exercise.video} label={name}/>}</VisitedPanel>
              <div className="flex flex-wrap gap-2">
                {exercise.weight !== undefined && <span className="badge"><bdi dir="ltr">{exercise.weight}</bdi> {tr("كجم")}</span>}
                {exercise.rpe !== undefined && <span className="badge"><bdi dir="ltr">RPE {exercise.rpe}</bdi></span>}
                {exercise.rir !== undefined && <span className="badge"><bdi dir="ltr">RIR {exercise.rir}</bdi></span>}
                {exercise.tempo && <span className="badge">{tr("الإيقاع")} <bdi dir="ltr">{exercise.tempo}</bdi></span>}
              </div>
            </div>
          </details>;
        })}
        {clientId && day.exercises.length > 0 && <button type="button" className="btn mt-4" onClick={() => setLogging(logging === index ? null : index)}>{tr("سجّل هذه الحصة")}</button>}
        {clientId && logging === index && <WorkoutSessionForm clientId={clientId} program={program} dayIndex={index} onSaved={() => {}} onClose={() => setLogging(null)}/>}
      </div>
    </details>)}
  </div>;
}
