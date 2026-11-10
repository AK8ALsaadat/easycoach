"use client";
import { useLocale } from "./locale-provider";
import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  X,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  GripVertical,
} from "lucide-react";
import { ExerciseVisual } from "./exercise-visual";
import { useDialog } from "./use-dialog";
import {
  catalog,
  catalogSearch,
  muscles,
  equipment,
  exerciseName,
  exerciseInstructions,
  type CatalogExercise,
} from "@/lib/catalog";

const pageSize = 24;
export function ExerciseCatalog({
  onSelect,
  onClose,
  embedded = false,
  selectionLabel = "للجدول",
  onDropToDay,
  dropDays = [],
  initialDropDay = 0,
}: {
  onSelect?: (e: CatalogExercise) => void;
  onClose?: () => void;
  embedded?: boolean;
  selectionLabel?: string;
  onDropToDay?: (e: CatalogExercise, dayIndex: number) => boolean | void;
  dropDays?: { name: string; count: number; exercises?: { rowId?: string; name: string; sets: number; reps: string }[] }[];
  initialDropDay?: number;
}) {
  const { t: tr, language: locale } = useLocale();

  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [tool, setTool] = useState("");
  const [showVisuals, setShowVisuals] = useState(true);
  const [dragged, setDragged] = useState<CatalogExercise | null>(null);
  const [targetDay, setTargetDay] = useState(initialDropDay);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<CatalogExercise | null>(null);
  const dialogRef = useDialog(Boolean(selected), () => setSelected(null));
  const found = useMemo(
    () =>
      catalog
        .filter(
          (e) =>
            (!muscle || e.primaryMuscles.includes(muscle)) &&
            (!tool || e.equipment === tool) &&
            catalogSearch(e, query),
        ),
    [query, muscle, tool],
  );
  const pageCount = Math.max(1, Math.ceil(found.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const paged = found.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const activeFilters = Boolean(
    query || muscle || tool,
  );
  const board = Boolean(onDropToDay && dropDays.length);
  const targetIndex = Math.max(0, Math.min(targetDay, dropDays.length - 1));
  const canAdd = Boolean(onSelect || board);
  function addExercise(exercise: CatalogExercise, index = targetIndex) {
    if (onDropToDay && dropDays[index]) {
      if (onDropToDay(exercise, index) === false) {
        setFeedback(tr("هذا اليوم ممتلئ. اختر يومًا آخر أو احذف تمرينًا أولًا."));
        return;
      }
      setFeedback(tr("تمت إضافة {0} إلى {1}", exerciseName(exercise, locale), dropDays[index].name));
    } else {
      onSelect?.(exercise);
    }
  }
  function reset() {
    setQuery("");
    setMuscle("");
    setTool("");
    setPage(0);
  }
  return (
    <section className="catalog-panel" aria-label={tr("دليل التمارين")}>
      {!embedded && (
        <div className="catalog-heading">
          <div>
            <h2>{tr("مكتبة التمارين")}</h2>
            <p>{tr("اختر الحركة وراجع تفاصيلها قبل إضافتها للبرنامج.")}</p>
          </div>
          {onClose && (
            <button type="button" className="btn-secondary" onClick={onClose}>
              <X size={18} />
              {tr("إغلاق")}
            </button>
          )}
        </div>
      )}
      <div className="catalog-filters">
        <div className="catalog-search">
          <Search size={20} />
          <input
            aria-label={tr("ابحث في التمارين")}
            placeholder={tr("ابحث باسم التمرين بالعربية أو الإنجليزية…")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          {query && (
            <button
              type="button"
              aria-label={tr("مسح البحث")}
              onClick={() => {
                setQuery("");
                setPage(0);
              }}
            >
              <X size={17} />
            </button>
          )}
        </div>
        <select
          aria-label={tr("العضلة")}
          className="field"
          value={muscle}
          onChange={(e) => {
            setMuscle(e.target.value);
            setPage(0);
          }}
        >
          <option value="">{tr("كل العضلات")}</option>
          {Object.entries(muscles).map(([key, value]) => (
            <option key={key} value={key}>
              {tr(value)}
            </option>
          ))}
        </select>
        <select
          aria-label={tr("المعدات")}
          className="field"
          value={tool}
          onChange={(e) => {
            setTool(e.target.value);
            setPage(0);
          }}
        >
          <option value="">{tr("كل المعدات")}</option>
          {Object.entries(equipment).map(([key, value]) => (
            <option key={key} value={key}>
              {tr(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="catalog-results-bar">
        <p>{tr("{0} تمرين مطابق", String(found.length))}</p>
        <div>
          <label className="visuals-filter">
            <input
              type="checkbox"
              checked={showVisuals}
              aria-controls="catalog-movements"
              onChange={(e) => setShowVisuals(e.target.checked)}
            />
            {tr("عرض الصور التوضيحية")}
          </label>
          {activeFilters && (
            <button type="button" className="reset-filters" onClick={reset}>
              {tr("مسح الفلاتر")}
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {board && (
        <div className="catalog-schedule">
          <div className="catalog-schedule-heading">
            <div><h3>{tr("جدولك التدريبي")}</h3><p>{tr("اسحب بطاقة إلى اليوم، أو اختر اليوم ثم اضغط إضافة.")}</p></div>
            <label className="catalog-day-picker">
              {tr("الإضافة إلى")}
              <select className="field" value={targetIndex} onChange={event => setTargetDay(Number(event.target.value))}>
                {dropDays.map((item, index) => <option key={index} value={index}>{item.name}</option>)}
              </select>
            </label>
          </div>
        <div className="catalog-drop-days" aria-label={tr("أيام الجدول الأسبوعي")}>
          {dropDays.map((dropDay, index) => (
            <section
              key={index}
              aria-label={dropDay.name}
              data-day-index={index}
              className={`catalog-drop-day ${index === targetIndex ? "is-selected" : ""} ${dragged ? "is-ready" : ""} ${hoverDay === index ? "is-over" : ""}`}
              onDragOver={(event) => {
                if (!dragged) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setHoverDay(index);
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHoverDay(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged) addExercise(dragged, index);
                setDragged(null);
                setHoverDay(null);
              }}
            >
              <button type="button" className="catalog-day-title" aria-pressed={index === targetIndex} onClick={() => setTargetDay(index)}>
                <strong>{dropDay.name}</strong><span>{dropDay.count}</span>
              </button>
              <ol className="catalog-day-cards">
                {dropDay.exercises?.map((exercise, position) => <li key={exercise.rowId ?? position}>
                  <strong>{exercise.name}</strong><span>{tr("{0} مجموعات", String(exercise.sets))} · {exercise.reps}</span>
                </li>)}
              </ol>
              <small>{tr("أفلت التمرين هنا")}</small>
            </section>
          ))}
        </div>
        <p className="catalog-add-feedback" role="status" aria-live="polite">{feedback}</p>
        </div>
      )}
      {!found.length ? (
        <div className="empty catalog-empty">
          <SlidersHorizontal size={32} />
          <h3>{tr("لا توجد تمارين مطابقة")}</h3>
          <p>{tr("غيّر اسم البحث أو وسّع عوامل التصفية.")}</p>
          <button className="btn-secondary" onClick={reset}>
            {tr("عرض جميع التمارين")}
          </button>
        </div>
      ) : (
        <div id="catalog-movements" className={`exercise-grid ${showVisuals ? "" : "exercise-grid-compact"}`}>
          {paged.map((e) => (
            <article
              key={e.id}
              className={`movement-card ${showVisuals ? "" : "movement-card-compact"}`}
              draggable={Boolean(onDropToDay)}
              onDragStart={(event) => {
                setDragged(e);
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData("text/plain", e.id);
              }}
              onDragEnd={() => {setDragged(null); setHoverDay(null);}}
            >
              <button
                type="button"
                className="movement-open"
                onClick={() => setSelected(e)}
                aria-label={tr("تفاصيل ") + exerciseName(e, locale)}
              >
                {showVisuals && <ExerciseVisual key={e.id} exercise={e} />}
                <div className="movement-copy">
                  {board && <GripVertical className="movement-drag-handle" size={16} aria-hidden="true" />}
                  <h3>{exerciseName(e, locale)}</h3>
                  <p className="movement-english" dir="ltr">
                    {e.name}
                  </p>
                </div>
              </button>
              <div className="movement-meta">
                <span>
                  {tr(muscles[e.primaryMuscles[0]]) ?? tr("عضلات متعددة")}
                </span>
                <span>
                  {tr(equipment[e.equipment ?? ""]) ?? tr("معدات متنوعة")}
                </span>
              </div>
              <div className="movement-footer">
                <button
                  type="button"
                  className="movement-details-link"
                  onClick={() => setSelected(e)}
                >
                  {tr("شرح الحركة")}
                  <ArrowLeft size={16} />
                </button>
                {canAdd ? (
                  <button
                    type="button"
                    className="exercise-add"
                    onClick={() => addExercise(e)}
                  >
                    <Plus size={17} />
                    {board ? tr("إضافة إلى {0}", dropDays[targetIndex].name) : tr(selectionLabel)}
                  </button>
                ) : (
                  <span className="movement-level">
                    {tr(
                      {
                        beginner: "مبتدئ",
                        intermediate: "متوسط",
                        expert: "متقدم",
                      }[e.level],
                    )}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="catalog-pagination">
        <span>
          {found.length ? currentPage * pageSize + 1 : 0}–
          {Math.min((currentPage + 1) * pageSize, found.length)} {tr("من")}{" "}
          {found.length}
        </span>
        <div>
          <button
            type="button"
            className="btn-secondary"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronRight size={18} />
            {tr("السابق")}
          </button>
          <span className="page-position">
            {currentPage + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={currentPage + 1 >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            {tr("التالي")}
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={exerciseName(selected, locale)}
            className="modal-sheet exercise-detail"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="exercise-detail-heading">
              <div>
                <h2>{exerciseName(selected, locale)}</h2>
                <p dir="ltr">{selected.name}</p>
              </div>
              <button
                type="button"
                aria-label={tr("إغلاق تفاصيل الحركة")}
                className="icon-button"
                onClick={() => setSelected(null)}
              >
                <X size={22} />
              </button>
            </div>
            {showVisuals && <ExerciseVisual
              key={selected.id}
              exercise={selected}
              playable
              className="exercise-detail-visual"
            />}
            <div className="exercise-detail-body">
              <section className="exercise-anatomy">
                <div>
                  <h3>{tr("العضلات الرئيسية")}</h3>
                  <div className="muscle-tags">
                    {selected.primaryMuscles.map((m) => (
                      <span className="badge primary-muscle" key={m}>
                        {tr(muscles[m]) ?? m}
                      </span>
                    ))}
                  </div>
                </div>
                {selected.secondaryMuscles.length > 0 && (
                  <div>
                    <h3>{tr("العضلات المساعدة")}</h3>
                    <div className="muscle-tags">
                      {selected.secondaryMuscles.map((m) => (
                        <span className="badge" key={m}>
                          {tr(muscles[m]) ?? m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <h3>{tr("المعدات")}</h3>
                  <p>
                    {tr(equipment[selected.equipment ?? ""]) ??
                      tr("معدات متنوعة")}
                  </p>
                </div>
              </section>
              <section>
                <h3 className="instructions-heading">
                  {tr("طريقة أداء التمرين")}
                </h3>
                <ol
                  dir={locale === "ar" ? "rtl" : "ltr"}
                  className="exercise-instructions"
                >
                  {exerciseInstructions(selected, locale).map((line, index) => (
                    <li key={index}>
                      <span>{index + 1}</span>
                      <p>{line}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            {canAdd && (
              <div className="exercise-detail-action">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    addExercise(selected);
                    setSelected(null);
                  }}
                >
                  <Plus size={18} />
                  {embedded
                    ? tr("استخدم الحركة في برنامج جديد")
                    : tr("أضف الحركة للجدول")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
