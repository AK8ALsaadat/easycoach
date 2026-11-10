"use client";
import { useLocale } from "./locale-provider";
import { ExerciseVisual } from "./exercise-visual";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Copy,
  Plus,
  Save,
  Send,
  Trash2,
  Search,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import {
  content as contentSchema,
  type Content,
  type Exercise,
} from "@/lib/model";
import { mutate, type Result } from "@/app/actions";
import { Notice } from "./forms";
import { ExerciseCatalog } from "./exercise-catalog";
import { useDialog } from "./use-dialog";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { VideoUpload } from "./video-upload";
import { MealEditor } from "./meal-editor";
import { ProgramDayNav } from "./program-day-nav";
import { appendExercise, customExercise, isStarterExercise, transferExercise, repeatProgramDay } from "@/lib/program-builder";
function withRowIds(value: Content): Content {
  return {
    ...value,
    days: value.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => ({
        ...e,
        rowId: e.rowId ?? crypto.randomUUID(),
      })),
    })),
  };
}
import {
  catalogById,
  exerciseName,
  exerciseInstructions,
  type CatalogExercise,
} from "@/lib/catalog";

export function ProgramEditor({
  initial,
  name: initialName,
  id,
  clientId,
  library = [],
  separateNutrition = false,
}: {
  initial: Content;
  name: string;
  id?: string;
  clientId?: string;
  library?: Exercise[];
  separateNutrition?: boolean;
}) {
  const { t: tr, language: locale } = useLocale();

  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [plan, setPlan] = useState<Content>(() =>
    withRowIds({ ...structuredClone(initial), days: initial.days.map(d => ({ ...structuredClone(d), exercises: d.exercises.length === 1 && isStarterExercise(d.exercises[0]) ? [] : structuredClone(d.exercises) })) }),
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [day, setDay] = useState(0);
  const [tab, setTab] = useState<"training" | "nutrition">("training");
  const [hasSaved, setHasSaved] = useState(Boolean(id));
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [repeatSource,setRepeatSource]=useState<number|null>(null);
  const [repeatName,setRepeatName]=useState("");
  const [repeatWeekday,setRepeatWeekday]=useState("");
  const [repeatError,setRepeatError]=useState("");
  const repeatRef=useDialog(repeatSource!==null,()=>setRepeatSource(null));
  const [customName, setCustomName] = useState("");
  const [feedback, setFeedback] = useState("");
  const [undo, setUndo] = useState<{plan:Content;day:number}|null>(null);
  const customInput = useRef<HTMLInputElement>(null);
  const catalogRef = useDialog(catalogOpen, () => setCatalogOpen(false));
  const savedId = useRef(id);
  const revision = useRef(0);
  const lock = useRef(false);
  function changed() {
    setUndo(null);
    revision.current++;
    setDirty(true);
    setResult(null);
  }
  function edit(update: (value: Content) => Content) {
    setPlan((current) => withRowIds(update(current)));
    changed();
  }
  const save = useCallback(async () => {
    if (lock.current) return null;
    const check = contentSchema.safeParse(plan);
    if (!check.success || name.trim().length < 2) {
      setResult({
        ok: false,
        message: "أكمل اسم البرنامج وأسماء التمارين والمجموعات قبل الحفظ.",
      });
      return null;
    }
    lock.current = true;
    setBusy(true);
    const rev = revision.current;
    try {
      const response = await mutate(
        clientId ? "program_save" : "template_save",
        clientId
          ? { client_id: clientId, name, content: check.data }
          : { id: savedId.current, name, content: check.data },
      );
      setResult(response);
      if (response.ok) {
        savedId.current = (response.data as { id: string }).id;
        setHasSaved(true);
        if (rev === revision.current) setDirty(false);
        return savedId.current;
      }
      return null;
    } catch {
      setResult({
        ok: false,
        message: "تعذر حفظ المسودة. حافظ على الصفحة مفتوحة وأعد المحاولة.",
      });
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [plan, name, clientId]);
  useEffect(() => {
    if (!dirty || busy || result?.ok === false || !contentSchema.safeParse(plan).success || name.trim().length < 2) return;
    const timer = setTimeout(() => {
      void save();
    }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, busy, save, result, plan, name]);
  useUnsavedChanges(dirty);
  const active = plan.days[day] ?? plan.days[0];
  function updateExercise(
    index: number,
    field: string,
    value: string | number | undefined,
  ) {
    edit((current) => ({
      ...current,
      days: current.days.map((d, i) =>
        i === day
          ? {
              ...d,
              exercises: d.exercises.map((e, j) =>
                j === index ? { ...e, [field]: value } : e,
              ),
            }
          : d,
      ),
    }));
  }
  function addCatalog(ex: CatalogExercise, targetDay = day) {
    if ((plan.days[targetDay]?.exercises.length ?? 40) >= 40) return false;
    edit(current => appendExercise(current, targetDay, { ...customExercise(exerciseName(ex, locale)), catalogId: ex.id }));
    return true;
  }
  function addDay() {
    if (plan.days.length >= 14) return;
    const next=plan.days.length;
    edit(current=>({...current,days:[...current.days,{name:tr("اليوم {0}",String(next+1)),exercises:[]}]}));
    setDay(next); setCustomName(""); setFeedback("");
  }
  function openRepeat(index:number){
    if(plan.days.length>=14)return;
    const source=plan.days[index];if(!source)return;
    let count=2,name="";
    do {const suffix=` · ${tr("نسخة {0}",String(count++))}`;name=source.name.slice(0,100-suffix.length)+suffix;}while(plan.days.some(day=>day.name===name));
    setRepeatName(name);setRepeatWeekday("");setRepeatError("");setRepeatSource(index);
  }
  function addCustom() {
    const title=customName.trim();
    if(title.length<2 || active.exercises.length>=40) return;
    edit(current=>appendExercise(current,day,customExercise(title)));
    setCustomName("");setFeedback(tr("تمت إضافة {0} إلى {1}",title,active.name));
    customInput.current?.focus();
  }
  function moveExercise(index: number, direction: number) {
    edit((c) => ({
      ...c,
      days: c.days.map((d, i) => {
        if (i !== day) return d;
        const list = [...d.exercises];
        [list[index], list[index + direction]] = [
          list[index + direction],
          list[index],
        ];
        return { ...d, exercises: list };
      }),
    }));
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-60 flex-1">
          <label htmlFor="plan-name">
            {tr("اسم")} {clientId ? tr("البرنامج") : tr("القالب")}
          </label>
          <input
            id="plan-name"
            className="field"
            value={name}
            maxLength={140}
            onChange={(e) => {
              setName(e.target.value);
              changed();
            }}
          />
        </div>
        <span role="status" className="badge">
          {busy
            ? tr("نحفظ المسودة…")
            : dirty
              ? tr("تعديلات لم تُحفظ بعد")
              : hasSaved
                ? tr("المسودة محفوظة")
                : tr("مسودة جديدة")}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 border-b pb-4">
        <button
          type="button"
          className={tab === "training" ? "btn" : "btn-secondary"}
          onClick={() => setTab("training")}
        >
          {tr("البرنامج التدريبي")}
        </button>
        {separateNutrition && clientId ? <Link className="btn-secondary" href={`/coach/clients/${clientId}/edit?tab=nutrition`}>{tr("تعديل السعرات")}</Link> : <button
          type="button"
          className={tab === "nutrition" ? "btn" : "btn-secondary"}
          onClick={() => setTab("nutrition")}
        >
          {tr("التغذية والأهداف")}
        </button>}
      </div>
      {tab === "nutrition" ? (
        <div className="space-y-5">
          <div className="nutrition-heading">
            <div>
              <p className="eyebrow">{tr("التغذية · الأهداف اليومية")}</p>
              <h2>{tr("هدف اليوم، قبل تفاصيل الوجبات.")}</h2>
            </div>
            <span className="badge">
              {tr("طاقة الماكروز")}{" "}
              {plan.nutrition.protein * 4 +
                plan.nutrition.carbs * 4 +
                plan.nutrition.fat * 9}{" "}
              kcal
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(
              [
                ["calories", tr("السعرات (kcal)")],
                ["protein", tr("البروتين (غ)")],
                ["carbs", tr("الكاربوهيدرات (غ)")],
                ["fat", tr("الدهون (غ)")],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label htmlFor={`nutrition-${field}`}>{tr(label)}</label>
                <input
                  id={`nutrition-${field}`}
                  type="number"
                  min={0}
                  max={field === "calories" ? 10000 : 1000}
                  className="field"
                  value={plan.nutrition[field]}
                  onChange={(e) =>
                    edit((c) => ({
                      ...c,
                      nutrition: {
                        ...c.nutrition,
                        [field]: Number(e.target.value),
                      },
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <label htmlFor="nutrition-text">
            {tr("الخطة والملاحظات الغذائية")}
          </label>
          <textarea
            id="nutrition-text"
            className="field min-h-56"
            maxLength={10000}
            value={plan.nutrition.text}
            onChange={(e) =>
              edit((c) => ({
                ...c,
                nutrition: { ...c.nutrition, text: e.target.value },
              }))
            }
          />
          <MealEditor
            nutrition={plan.nutrition}
            onChange={(nutrition) => edit((c) => ({ ...c, nutrition }))}
          />
        </div>
      ) : (
        <div className="program-builder-grid">
          <ProgramDayNav days={plan.days} selected={day} onSelect={index=>{setDay(index);setFeedback("");}} onAdd={addDay} onRepeat={openRepeat}/>
          <section className="program-session" aria-label={tr("إعداد الحصة التدريبية")}>
          <div className="session-toolbar">
            <div>
              <p className="eyebrow">{tr("بناء الحصة التدريبية")}</p>
              <h2>
                {active.name} · {active.exercises.length} {tr("حركات")}{" "}
                <span className="text-muted">/</span>{" "}
                {active.exercises.reduce((n, e) => n + e.sets, 0)} {tr("جولة")}
              </h2>
            </div>
            <div className="program-session-actions"><button type="button" className="btn-secondary" disabled={plan.days.length>=14} onClick={()=>openRepeat(day)}><Copy size={16}/>{tr("تكرار اليوم")}</button><button
              type="button"
              className="btn"
              onClick={() => setCatalogOpen(true)}
            >
              <Search size={16} />
              {tr("إضافة من مكتبة التمارين")}
            </button></div>
          </div>
          <div className="program-quick-add">
            <label htmlFor="custom-exercise-name">{tr("أضف تمرينك الخاص")}</label>
            <p>{tr("اكتب أي اسم تمرين، أو اختر من المكتبة. لا تحتاج صورة أو فيديو.")}</p>
            <div><input ref={customInput} id="custom-exercise-name" className="field" placeholder={tr("مثال: سكوات بالدمبل مع توقف")} value={customName} maxLength={140} onChange={event=>setCustomName(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();addCustom();}}}/>
            <button type="button" className="btn" disabled={customName.trim().length<2 || active.exercises.length>=40} onClick={addCustom}><Plus size={16}/>{tr("إضافة التمرين")}</button></div>
            <p role="status">{feedback || tr("الافتراضي: 3 مجموعات · 10–12 عدة · 90 ثانية راحة. عدّلها بعد الإضافة.")}</p>
          </div>
          {undo && <div className="program-undo" role="status"><span>{tr("تم تعديل الجدول. يمكنك التراجع.")}</span><button type="button" className="btn-soft" onClick={()=>{edit(()=>undo.plan);setDay(undo.day);}}>{tr("تراجع")}</button></div>}
          <details className="program-day-settings"><summary>{tr("اسم اليوم، موعده والتقسيمة الأسبوعية")}</summary>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              {tr("تقسيمة جاهزة")}
              <select
                aria-label={tr("بناء تقسيمة أسبوعية")}
                className="field"
                value=""
                onChange={(event) => {
                  const splits: Record<string, string[]> = {
                    ppl3: ["دفع", "سحب", "أرجل"],
                    ppl6: [
                      "دفع 1",
                      "سحب 1",
                      "أرجل 1",
                      "دفع 2",
                      "سحب 2",
                      "أرجل 2",
                    ],
                    upper4: ["علوي 1", "سفلي 1", "علوي 2", "سفلي 2"],
                    full3: ["جسم كامل 1", "جسم كامل 2", "جسم كامل 3"],
                    custom5: [
                      "اليوم 1",
                      "اليوم 2",
                      "اليوم 3",
                      "اليوم 4",
                      "اليوم 5",
                    ],
                  };
                  const names = splits[event.target.value];
                  if (!names) return;
                  if (
                    !window.confirm(
                      "ستستبدل أيام المسودة بالتقسيمة المحددة. البرنامج المنشور لا يتغير حتى تنشر. تتابع؟",
                    )
                  )
                    return;
                  edit((current) => ({
                    ...current,
                    days: names.map((name, index) => ({
                      name,
                      weekday: names.length === 3 ? index * 2 : index,
                      exercises: [],
                    })),
                  }));
                  setDay(0);
                }}
              >
                <option value="">
                  {tr("اختر تقسيمة أو احتفظ بالأيام الحالية")}
                </option>
                <option value="ppl3">
                  {tr("Push / Pull / Legs · 3 أيام")}
                </option>
                <option value="ppl6">
                  {tr("Push / Pull / Legs · 6 أيام")}
                </option>
                <option value="upper4">{tr("Upper / Lower · 4 أيام")}</option>
                <option value="full3">{tr("Full Body · 3 أيام")}</option>
                <option value="custom5">{tr("تقسيمة مخصصة · 5 أيام")}</option>
              </select>
            </label>
            <label>
              {tr("يوم الأسبوع")}
              <select
                aria-label={tr("يوم الأسبوع التدريبي")}
                className="field"
                value={active.weekday ?? ""}
                onChange={(event) =>
                  edit((current) => ({
                    ...current,
                    days: current.days.map((d, index) =>
                      index === day
                        ? {
                            ...d,
                            weekday:
                              event.target.value === ""
                                ? undefined
                                : Number(event.target.value),
                          }
                        : d,
                    ),
                  }))
                }
              >
                <option value="">{tr("بدون يوم محدد")}</option>
                {[
                  tr("الأحد"),
                  tr("الاثنين"),
                  tr("الثلاثاء"),
                  tr("الأربعاء"),
                  tr("الخميس"),
                  tr("الجمعة"),
                  tr("السبت"),
                ].map((label, index) => (
                  <option key={index} value={index}>
                    {tr(label)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              aria-label={tr("اسم اليوم")}
              className="field max-w-sm"
              value={active.name}
              maxLength={100}
              onChange={(e) =>
                edit((c) => ({
                  ...c,
                  days: c.days.map((d, i) =>
                    i === day ? { ...d, name: e.target.value } : d,
                  ),
                }))
              }
            />

            <button
              type="button"
              className="btn-secondary text-red-700"
              disabled={plan.days.length === 1}
              onClick={() => {
                const previous={plan:structuredClone(plan),day};
                edit((c) => ({ ...c, days: c.days.filter((_, i) => i !== day) }));
                setDay(0); setUndo(previous);
              }}
            >
              <Trash2 size={16} />
              {tr("حذف اليوم")}
            </button>
          </div>
          </details>
          {!active.exercises.length && <div className="program-empty-day"><Plus size={26}/><h3>{tr("ابدأ أول تمرين في هذا اليوم")}</h3><p>{tr("اكتب اسم تمرينك بالأعلى أو اختر عدة تمارين من المكتبة.")}</p><button type="button" className="btn-soft" onClick={()=>customInput.current?.focus()}>{tr("كتابة اسم تمرين")}</button></div>}
          <div className="space-y-4">
            {active.exercises.map((e, i) => (
              <div
                key={`${day}:${e.rowId ?? i}`}
                className="program-exercise-card"
                data-testid="program-exercise-row"
              >
                {e.catalogId && catalogById.has(e.catalogId) ? (
                  <div className="exercise-visual">
                    <ExerciseVisual
                      key={e.catalogId}
                      exercise={catalogById.get(e.catalogId)!}
                    />
                    <div>
                      <span className="eyebrow">
                        {tr("الحركة")} {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="text-xs text-muted">
                        {exerciseName(catalogById.get(e.catalogId)!, locale)}
                      </p>
                    </div>
                  </div>
                ) : null}
                {e.catalogId && catalogById.has(e.catalogId) && (
                  <details className="program-instructions mb-4">
                    <summary>{tr("شرح أداء التمرين بالعربية")}</summary>
                    <ol
                      dir={locale === "ar" ? "rtl" : "ltr"}
                      className="exercise-instructions list-inside list-decimal text-sm leading-8 text-muted"
                    >
                      {exerciseInstructions(
                        catalogById.get(e.catalogId)!,
                        locale,
                      ).map((line, step) => (
                        <li key={step}>{line}</li>
                      ))}
                    </ol>
                  </details>
                )}
                <div className="exercise-row-heading">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-teal">
                    {i + 1}
                  </span>
                  <input
                    aria-label={tr("اسم التمرين {0}", String(i + 1))}
                    className="field"
                    value={e.name}
                    maxLength={140}
                    onChange={(event) =>
                      updateExercise(i, "name", event.target.value)
                    }
                  />
                  <button
                    type="button"
                    aria-label={tr("رفع التمرين {0}", String(i + 1))}
                    className="btn-secondary !px-2"
                    disabled={i === 0}
                    onClick={() => moveExercise(i, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={tr("تنزيل التمرين {0}", String(i + 1))}
                    className="btn-secondary !px-2"
                    disabled={i === active.exercises.length - 1}
                    onClick={() => moveExercise(i, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={tr("حذف التمرين {0}", String(i + 1))}
                    className="text-muted hover:text-red-600"
                    onClick={() => {
                      const previous={plan:structuredClone(plan),day};
                      edit((c) => ({
                        ...c,
                        days: c.days.map((d, j) =>
                          j === day
                            ? {
                                ...d,
                                exercises: d.exercises.filter(
                                  (_, n) => n !== i,
                                ),
                              }
                            : d,
                        ),
                      })); setUndo(previous);
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ["sets", tr("المجموعات")],
                      ["reps", tr("العدات")],
                      ["rest", tr("الراحة (ثانية)")],
                    ] as const
                  ).map(([f, label]) => (
                    <div key={f}>
                      <label htmlFor={`ex-${i}-${f}`}>{tr(label)}</label>
                      <input
                        id={`ex-${i}-${f}`}
                        className="field"
                        type={f === "reps" ? "text" : "number"}
                        min={f === "sets" ? 1 : 0}
                        max={f === "sets" ? 20 : f === "rest" ? 600 : undefined}
                        value={e[f]}
                        onChange={(event) =>
                          updateExercise(
                            i,
                            f,
                            f === "reps"
                              ? event.target.value
                              : Number(event.target.value),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
                <details className="program-exercise-more"><summary>{tr("الشرح والفيديو والأوزان المتقدمة")}</summary>
                <div className="mt-4 border-t pt-4">
                  <VideoUpload
                    onComplete={(mediaId) => {
                      edit((c) => ({
                        ...c,
                        days: c.days.map((d, n) =>
                          n === day
                            ? {
                                ...d,
                                exercises: d.exercises.map((x) =>
                                  x.rowId === e.rowId ? { ...x, mediaId } : x,
                                ),
                              }
                            : d,
                        ),
                      }));
                    }}
                  />
                  {e.mediaId ? (
                    <div className="mt-3">
                      <video
                        controls
                        preload="none"
                        className="max-h-64 w-full rounded bg-black"
                        src={"/api/media/" + e.mediaId}
                      />
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-red-700"
                        onClick={() =>
                          edit((c) => ({
                            ...c,
                            days: c.days.map((d, n) =>
                              n === day
                                ? {
                                    ...d,
                                    exercises: d.exercises.map((x, j) => {
                                      if (j !== i) return x;
                                      const next = { ...x };
                                      delete next.mediaId;
                                      return next;
                                    }),
                                  }
                                : d,
                            ),
                          }))
                        }
                      >
                        <X size={13} />
                        {tr("إزالة الفيديو من الحركة")}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {(
                    [
                      ["weight", tr("الوزن (كجم)"), 1500],
                      ["rpe", "RPE", 10],
                      ["rir", "RIR", 20],
                    ] as const
                  ).map(([field, label, max]) => (
                    <label key={field} className="text-sm">
                      {tr(label)}
                      <input
                        aria-label={label + tr(" للتمرين ") + (i + 1)}
                        className="field mt-1"
                        type="number"
                        min={0}
                        max={max}
                        step={field === "rir" ? 1 : 0.5}
                        value={e[field] ?? ""}
                        onChange={(event) =>
                          updateExercise(
                            i,
                            field,
                            event.target.value === ""
                              ? undefined
                              : Number(event.target.value),
                          )
                        }
                      />
                    </label>
                  ))}
                  <label className="text-sm">
                    {tr("الإيقاع Tempo")}
                    <input
                      aria-label={tr("الإيقاع للتمرين ") + (i + 1)}
                      dir="ltr"
                      className="field mt-1"
                      maxLength={40}
                      placeholder="3-1-1-0"
                      value={e.tempo ?? ""}
                      onChange={(event) =>
                        updateExercise(i, "tempo", event.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="mt-4">
                  <p className="text-xs text-muted">
                    {tr("شرح الحركة ورابط الفيديو")}
                  </p>
                  <label className="mt-3" htmlFor={`ex-description-${i}`}>
                    {tr("الشرح")}
                  </label>
                  <textarea
                    id={`ex-description-${i}`}
                    className="field"
                    maxLength={2000}
                    value={e.description}
                    onChange={(event) =>
                      updateExercise(i, "description", event.target.value)
                    }
                  />
                  <label className="mt-3" htmlFor={`ex-video-${i}`}>
                    {tr("رابط فيديو اختياري (https)")}
                  </label>
                  <input
                    id={`ex-video-${i}`}
                    className="field"
                    type="url"
                    value={e.video}
                    onChange={(event) =>
                      updateExercise(i, "video", event.target.value)
                    }
                  />
                </div>
                </details>
                <div className="program-exercise-actions">
                  <button type="button" className="btn-secondary" disabled={active.exercises.length>=40} onClick={()=>edit(current=>appendExercise(current,day,e))}><Copy size={14}/>{tr("نسخ التمرين")}</button>
                  {plan.days.length>1 && <select className="field" aria-label={tr("نقل التمرين {0} إلى يوم",String(i+1))} value="" onChange={event=>{const target=Number(event.target.value);const next=transferExercise(plan,day,i,target);if(next===plan)return;const previous={plan:structuredClone(plan),day};edit(()=>next);setUndo(previous);}}>
                    <option value="">{tr("نقل إلى يوم آخر…")}</option>{plan.days.map((target,index)=>index===day?null:<option key={index} value={index} disabled={target.exercises.length>=40}>{target.name}</option>)}
                  </select>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-secondary"
              disabled={active.exercises.length >= 40}
              onClick={() => {customInput.current?.focus();customInput.current?.scrollIntoView({block:"center",behavior:"smooth"});}}
            >
              <Plus size={16} />
              {tr("تمرين جديد")}
            </button>
            {library.length ? (
              <select
                aria-label={tr("إضافة من مكتبة التمارين")}
                className="field max-w-xs"
                value=""
                onChange={(event) => {
                  const ex = library.find((x) => x.id === event.target.value);
                  if (ex) edit(current=>appendExercise(current,day,{...customExercise(ex.name),description:ex.description,video:ex.video}));
                }}
              >
                <option value="">{tr("إضافة نسخة من المكتبة…")}</option>
                {library.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          </section>
        </div>
      )}
      <div className="program-savebar sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur">
        <p className="max-w-md text-xs text-muted">
          {clientId
            ? tr("جاهز؟ انشر التحديث على رابط العميل.")
            : tr("احفظه في مكتبتك للبرامج القادمة.")}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void save()}
          >
            <Save size={16} />
            {tr("حفظ المسودة")}
          </button>
          {clientId ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={async () => {
                const draftId = await save();
                if (!draftId) return;
                const response = await mutate("program_publish", {
                  id: draftId,
                });
                setResult(response);
                if (response.ok) {
                  savedId.current = undefined;
                  setResult({
                    ok: true,
                    message: "تم النشر. المتدرب يرى هذه النسخة الآن.",
                  });
                  router.refresh();
                }
              }}
            >
              <Send size={16} />
              {tr("نشر للمتدرب")}
            </button>
          ) : (
            <span className="hidden items-center gap-1 text-xs text-teal sm:flex">
              <Check size={14} />
              {tr("نسخة مستقلة")}
            </span>
          )}
        </div>
      </div>
      {plan.days.some(d=>!d.exercises.length) && <p className="text-sm text-amber-800" role="status">{tr("أضف تمرينًا واحدًا على الأقل لكل يوم حتى تُحفظ المسودة وتصبح جاهزة للنشر.")}</p>}
      <Notice result={result} />
      {repeatSource!==null && <div className="modal-backdrop" onClick={()=>setRepeatSource(null)}><div className="modal-sheet max-w-lg" ref={repeatRef} role="dialog" aria-modal="true" aria-labelledby="repeat-day-title" tabIndex={-1} onClick={event=>event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-4"><h2 id="repeat-day-title">{tr("تكرار اليوم")}</h2><button type="button" className="icon-button" aria-label={tr("إغلاق")} onClick={()=>setRepeatSource(null)}><X size={20}/></button></div>
        <p className="mb-5 text-sm text-muted">{tr("تُنسخ التمارين وإعداداتها إلى حصة مستقلة. تعديل النسخة لا يغيّر الأصل.")}</p>
        <form className="space-y-4" onSubmit={event=>{
          event.preventDefault();const next=repeatProgramDay(plan,repeatSource,repeatName,repeatWeekday===""?undefined:Number(repeatWeekday));
          if(next===plan){setRepeatError(tr("اختر اسمًا مختلفًا للنسخة وتأكد من أن عدد الأيام أقل من 14."));return;}
          const previous={plan:structuredClone(plan),day};edit(()=>next);setDay(repeatSource+1);setRepeatSource(null);setUndo(previous);setFeedback("");
        }}>
          <label>{tr("اسم اليوم الجديد")}<input className="field mt-2" value={repeatName} maxLength={100} required onChange={event=>{setRepeatName(event.target.value);setRepeatError("");}}/></label>
          <label>{tr("موعد الحصة الجديدة")}<select className="field mt-2" aria-label={tr("موعد الحصة الجديدة")} value={repeatWeekday} onChange={event=>setRepeatWeekday(event.target.value)}><option value="">{tr("بدون يوم محدد")}</option>{["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"].map((name,index)=><option key={index} value={index}>{tr(name)}</option>)}</select></label>
          {repeatError && <p role="alert" className="text-sm text-red-700">{repeatError}</p>}
          <div className="flex gap-2"><button type="submit" className="btn">{tr("إضافة النسخة للجدول")}</button><button type="button" className="btn-secondary" onClick={()=>setRepeatSource(null)}>{tr("إلغاء")}</button></div>
        </form>
      </div></div>}
      {catalogOpen ? (
        <div className="modal-backdrop">
          <div
            ref={catalogRef}
            tabIndex={-1}
            className="modal-sheet max-w-6xl"
            role="dialog"
            aria-modal="true"
            aria-label={tr("مكتبة الحركات")}
          >
            <ExerciseCatalog
              onSelect={addCatalog}
              onClose={() => setCatalogOpen(false)}
              onDropToDay={addCatalog}
              initialDropDay={day}
              dropDays={plan.days.map((item) => ({
                name: item.name,
                count: item.exercises.length,
                exercises: item.exercises,
              }))}
            />
            <p className="sticky bottom-0 mt-4 bg-white p-3 text-center text-sm">
              {tr("الحصة الحالية:")} {active.exercises.length}{" "}
              {tr("حركة · تقدر تضيف أكثر من حركة قبل الإغلاق")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
