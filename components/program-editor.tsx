"use client";
import { useLocale } from "./locale-provider";
import { countLabel, formatNumber, nouns } from "@/lib/plural";
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
  draftContent as draftSchema,
  type Content,
  type Exercise,
  blankContent,
} from "@/lib/model";
import { manage } from "@/app/management-actions";
import type { TemplateMeta } from "@/lib/management";
import { mutate, type Result } from "@/app/actions";
import { Notice } from "./forms";
import { ExerciseCatalog } from "./exercise-catalog";
import { ConfirmDialog } from "./modal";
import { useDialog } from "./use-dialog";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { VideoUpload } from "./video-upload";
import { ExerciseVideo } from "./exercise-video";
import { MealEditor } from "./meal-editor";
import { ExerciseField } from "./exercise-field";
import { showToast } from "./toast";
import { publishIssues, type PublishIssue } from "@/lib/program-validation";
import { MacroTargets } from "./macro-targets";
import { caloriesFromMacros, inferCaloriesMode } from "@/lib/macros";
import { templateNameError } from "@/lib/template-names";
import { ProgramDayNav } from "./program-day-nav";
import { appendExercise, customExercise, dayName, displayDayName, isStarterExercise, transferExercise, repeatProgramDay, appendExercises } from "@/lib/program-builder";
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
  catalog,
  catalogById,
  exerciseName,
  isCustomExercise,
  type PickerExercise,
} from "@/lib/catalog";

export function ProgramEditor({
  initial,
  name: initialName,
  id,
  editRevision,
  clientId,
  library = [],
  separateNutrition = false,
  templateMeta,
  siblingTemplates = [],
}: {
  initial: Content;
  name: string;
  id?: string;
  editRevision?: number;
  clientId?: string;
  library?: Exercise[];
  separateNutrition?: boolean;
  templateMeta?: TemplateMeta;
  /** Other templates of this coach, for the "same name" check while renaming. */
  siblingTemplates?: { id: string; name: string }[];
}) {
  const { t: tr, language: locale } = useLocale();

  const router = useRouter();
  const [name, setName] = useState(initialName);
  // A suggested name is selected on first focus; after the coach has touched the
  // field we never re-select, so returning to it keeps the caret where it was.
  const touchedName = useRef(false);
  // A legacy template name is only re-checked once the coach edits it.
  const nameError = clientId
    ? name.trim().length < 2 ? "اكتب اسم البرنامج" : null
    : name === initialName && name.trim().length >= 2 ? null : templateNameError(name, siblingTemplates, id);
  const [plan, setPlan] = useState<Content>(() =>
    withRowIds({ ...structuredClone(initial), days: initial.days.map(d => ({ ...structuredClone(d), exercises: d.exercises.length === 1 && isStarterExercise(d.exercises[0]) ? [] : structuredClone(d.exercises) })) }),
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [day, setDay] = useState(0);
  const [deleteDay, setDeleteDay] = useState<number | null>(null);
  const [templateKind, setTemplateKind] = useState<TemplateMeta["kind"]>(templateMeta?.kind ?? "workout");
  const [tab, setTab] = useState<"training" | "nutrition">(templateMeta?.kind && templateMeta.kind !== "workout" ? "nutrition" : "training");
  const showTargets = Boolean(clientId) || templateKind === "nutrition_targets";
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
  const catalogRef = useDialog(catalogOpen, () => setCatalogOpen(false), "[data-picker-search]");
  const savedId = useRef(id);
  const savedEditRevision = useRef<number | null>(editRevision ?? null);
  const revision = useRef(0);
  const lock = useRef(false);
  const [checkPublish, setCheckPublish] = useState(false);
  // Re-evaluated on every edit so fixed problems disappear from the list immediately.
  const issues: PublishIssue[] = checkPublish ? publishIssues(plan) : [];
  const invalidCells = useRef(new Set<string>());
  const [invalidCount, setInvalidCount] = useState(0);
  const trackCell = useCallback((cell: string, valid: boolean) => {
    if (valid) invalidCells.current.delete(cell);
    else invalidCells.current.add(cell);
    setInvalidCount(invalidCells.current.size);
  }, []);
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
    // A draft always saves. Empty days and unfinished exercises are the normal
    // state of work in progress; only publishing demands a complete program.
    const check = draftSchema.safeParse(!clientId && templateKind !== "workout" ? { ...plan, days: blankContent.days } : plan);
    if (nameError) {
      setResult({ ok: false, message: nameError });
      return null;
    }
    if (invalidCells.current.size) {
      setResult({ ok: false, message: "صحّح المجموعات والتكرارات والراحة المظللة قبل الحفظ." });
      return null;
    }
    if (!check.success) {
      // Only reachable for a value no field editor can produce; name the field.
      const issue = check.error.issues[0];
      setResult({
        ok: false,
        message: issue?.message
          ? `تعذر الحفظ: ${issue.message}`
          : "تعذر حفظ المسودة. راجع القيم المظللة وحاول مرة أخرى.",
      });
      return null;
    }
    lock.current = true;
    setBusy(true);
    const rev = revision.current;
    try {
      const response = clientId
        ? await mutate("program_save", { client_id: clientId, name, content: check.data, expected_draft_id: savedId.current ?? null, expected_edit_revision: savedEditRevision.current })
        : await manage("template_save_typed", { id: savedId.current, name, content: check.data, kind: templateKind, description: templateMeta?.description ?? "", archived: templateMeta?.archived ?? false });
      setResult(response);
      if (response.ok) {
        savedId.current = (response.data as { id: string }).id;
        savedEditRevision.current = (response.data as { edit_revision?: number }).edit_revision ?? null;
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
  }, [plan, name, clientId, templateKind, templateMeta, nameError]);
  useEffect(() => {
    // Autosave follows the same rule as the save button: an incomplete draft is
    // still saved, so a closed tab never costs the coach their work.
    if (!dirty || busy || result?.ok === false || nameError || invalidCount || !draftSchema.safeParse(!clientId && templateKind !== "workout" ? { ...plan, days: blankContent.days } : plan).success) return;
    const timer = setTimeout(() => {
      void save();
    }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, busy, save, result, plan, name, clientId, templateKind, nameError, invalidCount]);
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
  function addCatalog(exercises:PickerExercise[],targetDay:number) {
    if(!plan.days[targetDay]||plan.days[targetDay].exercises.length+exercises.length>40)return false;
    // A guide movement is linked by catalogId (that is where its image comes
    // from). An exercise from the coach library has no catalog entry, so its
    // instructions, link and uploaded clip are copied into the row instead.
    edit(current=>appendExercises(current,targetDay,exercises.map(ex=>isCustomExercise(ex)
      ? {...customExercise(ex.name),description:ex.custom.description,coachNotes:ex.custom.description,video:ex.custom.video,...(ex.custom.mediaId?{mediaId:ex.custom.mediaId}:{})}
      : {...customExercise(exerciseName(ex,locale)),catalogId:ex.id})));
    setDay(targetDay);setFeedback(tr("تمت إضافة المجموعة ({0}) إلى {1}",String(exercises.length),plan.days[targetDay].name));
    return true;
  }
  function addDay() {
    if (plan.days.length >= 14) return;
    const next=plan.days.length;
    edit(current=>{let name=dayName(next,locale);for(let n=2;current.days.some(item=>item.name===name);n++)name=`${dayName(next,locale)} (${n})`;return {...current,days:[...current.days,{name,exercises:[]}]};});
    setDay(next); setCustomName(""); setFeedback("");
  }
  /** Removing a day with exercises in it is asked about first; the undo bar
   *  still covers an accidental confirm. */
  function removeDay(index: number) {
    if (plan.days.length === 1) return;
    if (plan.days[index]?.exercises.length) {
      setDeleteDay(index);
      return;
    }
    commitRemoveDay(index);
  }
  function commitRemoveDay(index: number) {
    const previous = { plan: structuredClone(plan), day };
    const name = plan.days[index]?.name ?? "";
    edit((current) => ({ ...current, days: current.days.filter((_, i) => i !== index) }));
    setDay((current) => (current >= index && current > 0 ? current - 1 : current));
    setUndo(previous);
    setDeleteDay(null);
    setFeedback(tr("تم حذف {0}. يمكنك التراجع.", name));
  }
  function moveDay(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= plan.days.length) return;
    const previous = { plan: structuredClone(plan), day };
    edit((current) => {
      const days = [...current.days];
      [days[index], days[target]] = [days[target], days[index]];
      return { ...current, days };
    });
    setDay(target);
    setUndo(previous);
  }
  function openRepeat(index:number){
    if(plan.days.length>=14)return;
    const source=plan.days[index];if(!source)return;
    let count=2,name="";
    do {const suffix=` · ${tr("نسخة {0}",String(count++))}`;name=source.name.slice(0,100-suffix.length)+suffix;}while(plan.days.some(day=>day.name===name));
    setRepeatName(name);setRepeatWeekday("");setRepeatError("");setRepeatSource(index);
  }
  /** Normalised for matching: spacing and Arabic diacritics ignored. */
  const nameKey = (value: string) => value.trim().replace(/[\u064B-\u065F\u0670]/g, "").replace(/\s+/g, " ").toLowerCase();
  function addCustom() {
    const title = customName.trim();
    if (title.length < 2 || active.exercises.length >= 40) return;
    // Typing a name that the coach already has in their library, or that
    // matches a guide movement, carries that record with it: instructions,
    // link, uploaded clip and the guide image. Without this the trainee saw
    // the name as plain text with nothing behind it.
    const own = library.find((item) => nameKey(item.name) === nameKey(title));
    const fromCatalog = catalog.find(
      (item) => nameKey(exerciseName(item, locale)) === nameKey(title) || nameKey(item.name) === nameKey(title),
    );
    const row = {
      ...customExercise(title),
      ...(own ? { description: own.description, coachNotes: own.description, video: own.video, ...(own.media_id ? { mediaId: own.media_id } : {}) } : {}),
      ...(!own && fromCatalog ? { catalogId: fromCatalog.id } : {}),
    };
    edit((current) => appendExercise(current, day, row));
    setCustomName("");
    setFeedback(
      own
        ? tr("تمت إضافة {0} إلى {1} مع تعليماته وفيديوه", title, active.name)
        : tr("تمت إضافة {0} إلى {1}", title, active.name),
    );
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
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "plan-name-error" : undefined}
            placeholder={clientId ? tr("مثال: برنامج تضخيم 4 أيام") : tr("مثال: دفع/سحب/أرجل")}
            // A suggested name arrives selected, so typing replaces it instead
            // of appending at a caret parked after the suggestion.
            onFocus={(event) => {
              if (!touchedName.current) {
                event.currentTarget.select();
                touchedName.current = true;
              }
            }}
            onChange={(e) => {
              touchedName.current = true;
              setName(e.target.value);
              changed();
            }}
          />
          {nameError && <p id="plan-name-error" className="field-error">{tr(nameError)}</p>}
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
      {!clientId && <div className="space-y-2"><label htmlFor="template-kind">{tr("نوع القالب")}</label><select id="template-kind" className="field" value={templateKind} onChange={event => { const kind = event.target.value as TemplateMeta["kind"]; setTemplateKind(kind); setTab(kind === "workout" ? "training" : "nutrition"); changed(); }}><option value="workout">{tr("تمارين عامة")}</option><option value="nutrition">{tr("تغذية عامة — دون تغيير أهداف المتدرب")}</option><option value="nutrition_targets">{tr("تغذية مع أهداف مقترحة — اختياري")}</option></select><p className="text-xs text-muted">{tr(templateKind === "nutrition_targets" ? "هذا القالب يتضمن أهدافًا مقترحة؛ راجعها وعدّلها لكل متدرب قبل التعيين." : "السعرات والماكروز والأوزان والإيقاع تُخصص لكل متدرب من ملفه. فيديو شرح التمرين متاح في القالب العام.")}</p></div>}
      <div className="flex flex-wrap gap-2 border-b pb-4">
        {(clientId || templateKind === "workout") && <button
          type="button"
          className={tab === "training" ? "btn" : "btn-secondary"}
          onClick={() => setTab("training")}
        >
          {tr("البرنامج التدريبي")}
        </button>}
        {separateNutrition && clientId ? <Link className="btn-secondary" href={`/coach/clients/${clientId}/edit?tab=nutrition`}>{tr("تعديل السعرات")}</Link> : (clientId || templateKind !== "workout") && <button
          type="button"
          className={tab === "nutrition" ? "btn" : "btn-secondary"}
          onClick={() => setTab("nutrition")}
        >
          {tr(showTargets ? "التغذية والأهداف" : "التغذية")}
        </button>}
      </div>
      {tab === "nutrition" ? (
        <div className="space-y-5">
          {showTargets && <><div className="nutrition-heading">
            <div>
              <p className="eyebrow">{tr("التغذية · الأهداف اليومية")}</p>
              <h2>{tr("هدف اليوم، قبل تفاصيل الوجبات.")}</h2>
            </div>
            <span className="badge">
              {tr("طاقة الماكروز")} <bdi>{formatNumber(caloriesFromMacros(plan.nutrition))}</bdi> {tr("سعرة")}
            </span>
          </div>
          <MacroTargets
            idPrefix="nutrition"
            value={{ ...plan.nutrition, calories_mode: plan.nutrition.calories_mode ?? inferCaloriesMode(plan.nutrition) }}
            onChange={(targets) => edit((c) => ({ ...c, nutrition: { ...c.nutrition, ...targets } }))}
          /></>}
          <label htmlFor="nutrition-text">
            {tr("الخطة والملاحظات الغذائية")}
          </label>
          <textarea
            id="nutrition-text"
            className="field min-h-56"
            maxLength={clientId ? 10000 : 4000}
            value={plan.nutrition.text}
            onChange={(e) =>
              edit((c) => ({
                ...c,
                nutrition: { ...c.nutrition, text: e.target.value },
              }))
            }
          />
          <MealEditor
            includeTargets={showTargets}
            nutrition={showTargets ? { ...plan.nutrition, calories_mode: plan.nutrition.calories_mode ?? inferCaloriesMode(plan.nutrition) } : plan.nutrition}
            onChange={(nutrition) => edit((c) => ({ ...c, nutrition }))}
          />
        </div>
      ) : (
        <div className="program-builder-grid">
          <ProgramDayNav days={plan.days} selected={day} onSelect={index=>{setDay(index);setFeedback("");}} onAdd={addDay} onRepeat={openRepeat} onDelete={removeDay} onMove={moveDay}/>
          <section className="program-session" aria-label={tr("إعداد الحصة التدريبية")}>
          <div className="session-toolbar">
            <div>
              <p className="eyebrow">{tr("بناء الحصة التدريبية")}</p>
              <h2>
                {displayDayName(active.name, locale)} · {countLabel(locale, active.exercises.length, nouns.movement)}{" "}
                <span className="text-muted">/</span>{" "}
                {countLabel(locale, active.exercises.reduce((n, e) => n + e.sets, 0), nouns.round)}
              </h2>
            </div>
            <div className="program-session-actions"><button type="button" className="btn-secondary" disabled={plan.days.length>=14} onClick={()=>openRepeat(day)}><Copy size={16}/>{tr("تكرار اليوم")}</button><button
              type="button"
              className="btn"
              onClick={() => setCatalogOpen(true)}
            >
              <Search size={16} />
              {tr("اختيار التمارين")}
            </button></div>
          </div>
          <div className="program-quick-add">
            <label htmlFor="custom-exercise-name">{tr("أضف تمرينك الخاص")}</label>
            <p>{tr("اكتب أي اسم تمرين، أو اختر من المكتبة. لا تحتاج صورة أو فيديو.")}</p>
            <div><input ref={customInput} id="custom-exercise-name" className="field" placeholder={tr("مثال: سكوات بالدمبل مع توقف")} value={customName} maxLength={140} onChange={event=>setCustomName(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();addCustom();}}}/>
            <button type="button" className="btn" disabled={customName.trim().length<2 || active.exercises.length>=40} onClick={addCustom}><Plus size={16}/>{tr("إضافة التمرين")}</button></div>
            <p role="status">{feedback || tr("الافتراضي: 3 مجموعات · 10–12 تكرار · 90 ثانية راحة. عدّلها بعد الإضافة.")}</p>
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
              onClick={() => removeDay(day)}
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
                        {tr("الحركة")} {i + 1}
                      </span>
                      <p className="text-xs text-muted">
                        {exerciseName(catalogById.get(e.catalogId)!, locale)}
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className="exercise-row-heading">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-teal">
                    {i + 1}
                  </span>
                  <input
                    id={`ex-${i}-name`}
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
                      ["sets", "المجموعات"],
                      ["reps", "التكرارات"],
                      ["rest", "الراحة (ثانية)"],
                    ] as const
                  ).map(([f, label]) => (
                    <ExerciseField
                      key={f}
                      id={`ex-${i}-${f}`}
                      field={f}
                      label={tr(label)}
                      value={e[f]}
                      onCommit={(value) => updateExercise(i, f, value)}
                      onValidity={trackCell}
                    />
                  ))}
                </div>
                <label className="program-exercise-notes mt-3 block">
                  {tr("توجيهات المدرب لهذا التمرين (تظهر للمتدرب)")}
                  <textarea className="field mt-1" rows={3} maxLength={2000} value={e.coachNotes ?? ""} onChange={(event) => updateExercise(i, "coachNotes", event.target.value)} />
                </label>
                <details className="program-exercise-more"><summary>{tr(clientId ? "الفيديو والأوزان المتقدمة" : "فيديو شرح التمرين")}</summary>
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
                      <ExerciseVideo
                        src={"/api/media/" + e.mediaId}
                        label={tr("فيديو ") + (e.name || tr("التمرين"))}
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
                {clientId && <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                </div>}
                <div className="mt-4">
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
                aria-label={tr("اختيار التمارين")}
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
          {/* Autosave runs 1.2s after the last edit; the state is said out loud
              so nobody has to guess whether their work is safe. */}
          <span className="program-save-state" data-state={busy ? "saving" : dirty ? "unsaved" : hasSaved ? "saved" : "idle"}>
            {busy
              ? tr("جارٍ الحفظ…")
              : dirty
                ? tr("فيه تعديلات غير محفوظة")
                : hasSaved
                  ? tr("كل التعديلات محفوظة ✓")
                  : tr("ما فيه تعديلات بعد")}
          </span>
          <br />
          {clientId
            ? tr("جاهز؟ انشر التحديث على رابط المتدرب.")
            : tr("احفظه في مكتبتك للبرامج القادمة.")}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={async () => {
              // Stays in the editor on purpose: the coach is mid-edit.
              const saved = await save();
              if (saved) showToast({ message: tr("تم حفظ المسودة ✓"), tone: "success" });
            }}
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
                // Publishing is the strict gate: the full schema plus the
                // semantic checks the trainee would otherwise see.
                const complete = contentSchema.safeParse(plan);
                const found = publishIssues(plan);
                setCheckPublish(true);
                if (!complete.success && !found.length) {
                  setResult({ ok: false, message: `تعذر النشر: ${complete.error.issues[0]?.message ?? "راجع القيم المظللة"}` });
                  return;
                }
                if (found.length) {
                  setResult(null);
                  window.requestAnimationFrame(() => document.getElementById("publish-issues")?.focus());
                  return;
                }
                const draftId = await save();
                if (!draftId) return;
                const response = await mutate("program_publish", {
                  id: draftId,
                  expected_edit_revision: savedEditRevision.current ?? undefined,
                });
                setResult(response);
                if (response.ok) {
                  savedId.current = undefined;
                  savedEditRevision.current = null;
                  setResult({
                    ok: true,
                    message: "تم النشر. المتدرب يرى هذه النسخة الآن.",
                  });
                  showToast({ message: tr("تم نشر البرنامج للمتدرب ✓"), tone: "success" });
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
      {issues.length > 0 && (
        <section id="publish-issues" tabIndex={-1} className="publish-issues" role="alert" aria-labelledby="publish-issues-title">
          <h3 id="publish-issues-title">{tr("{0} تمنع النشر — المسودة محفوظة:", countLabel(locale, issues.length, nouns.issue))}</h3>
          <ul>
            {issues.map((issue) => (
              <li key={issue.key}>
                <button
                  type="button"
                  onClick={() => {
                    const target =
                      issue.kind === "exercise" ? `ex-${issue.index}-name` : issue.kind === "day" ? "program-custom-exercise" : `meal-${issue.index}-name`;
                    if (issue.kind === "exercise" || issue.kind === "day") { setTab("training"); setDay(issue.day ?? 0); }
                    else setTab("nutrition");
                    window.setTimeout(() => {
                      const element = document.getElementById(target) as HTMLInputElement | null;
                      element?.scrollIntoView({ behavior: "smooth", block: "center" });
                      element?.focus({ preventScroll: true });
                      if (issue.kind === "exercise") element?.select();
                    }, 60);
                  }}
                >
                  {issue.kind === "day"
                    ? tr("{0}: ما فيه أي تمرين. أضف تمرينًا أو احذف اليوم", plan.days[issue.day ?? 0]?.name ?? "")
                    : issue.kind === "exercise"
                      ? tr("{0}: التمرين {1} ما زال باسم «تمرين جديد»", plan.days[issue.day ?? 0]?.name ?? "", String(issue.index + 1))
                      : tr("{0}: الوجبة فارغة وكل قيمها صفر", plan.nutrition.meals?.[issue.index]?.name ?? "")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {plan.days.some((d) => !d.exercises.length) && (
        <p className="text-sm text-amber-800" role="status">
          {tr("فيه يوم بدون تمارين. المسودة تُحفظ عادي، لكن النشر يحتاج تمرينًا واحدًا على الأقل في كل يوم أو حذف اليوم الفاضي.")}
        </p>
      )}
      <ConfirmDialog
        open={deleteDay !== null}
        title={tr("حذف اليوم وتمارينه؟")}
        confirmLabel="احذف اليوم"
        danger
        onConfirm={() => {
          if (deleteDay !== null) commitRemoveDay(deleteDay);
        }}
        onClose={() => setDeleteDay(null)}
      >
        {tr("{0} فيه {1}. الحذف يشيل اليوم وتمارينه من المسودة، ويظهر لك زر تراجع بعدها.", plan.days[deleteDay ?? 0]?.name ?? "", countLabel(locale, plan.days[deleteDay ?? 0]?.exercises.length ?? 0, nouns.exercise))}
      </ConfirmDialog>
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
        <div className="modal-backdrop exercise-picker-backdrop">
          <div
            ref={catalogRef}
            tabIndex={-1}
            className="modal-sheet exercise-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={tr("اختيار التمارين")}
          >
            <ExerciseCatalog
              custom={library}
              onConfirm={addCatalog}
              onClose={() => setCatalogOpen(false)}
              initialDropDay={day}
              dropDays={plan.days.map((item) => ({
                name: item.name,
                count: item.exercises.length,
                exercises: item.exercises,
              }))}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
