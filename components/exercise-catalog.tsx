"use client";
import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  X,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { ExerciseVisual } from "./exercise-visual";
import { useDialog } from "./use-dialog";
import { exerciseMedia } from "@/lib/exercise-media";
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
}: {
  onSelect?: (e: CatalogExercise) => void;
  onClose?: () => void;
  embedded?: boolean;
  selectionLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [tool, setTool] = useState("");
  const [level, setLevel] = useState("");
  const [visualsOnly, setVisualsOnly] = useState(false);
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
            (!level || e.level === level) &&
            (!visualsOnly || Object.hasOwn(exerciseMedia, e.id)) &&
            catalogSearch(e, query),
        )
        .sort(
          (a, b) =>
            Number(Object.hasOwn(exerciseMedia, b.id)) -
            Number(Object.hasOwn(exerciseMedia, a.id)),
        ),
    [query, muscle, tool, level, visualsOnly],
  );
  const pageCount = Math.max(1, Math.ceil(found.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const paged = found.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const activeFilters = Boolean(
    query || muscle || tool || level || visualsOnly,
  );
  function reset() {
    setQuery("");
    setMuscle("");
    setTool("");
    setLevel("");
    setVisualsOnly(false);
    setPage(0);
  }
  return (
    <section className="catalog-panel" aria-label="دليل التمارين">
      {!embedded && (
        <div className="catalog-heading">
          <div>
            <h2>مكتبة التمارين</h2>
            <p>اختر الحركة وراجع تفاصيلها قبل إضافتها للبرنامج.</p>
          </div>
          {onClose && (
            <button type="button" className="btn-secondary" onClick={onClose}>
              <X size={18} />
              إغلاق
            </button>
          )}
        </div>
      )}
      <div className="catalog-filters">
        <div className="catalog-search">
          <Search size={20} />
          <input
            aria-label="ابحث في التمارين"
            placeholder="ابحث باسم التمرين بالعربية أو الإنجليزية…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          {query && (
            <button
              type="button"
              aria-label="مسح البحث"
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
          aria-label="العضلة"
          className="field"
          value={muscle}
          onChange={(e) => {
            setMuscle(e.target.value);
            setPage(0);
          }}
        >
          <option value="">كل العضلات</option>
          {Object.entries(muscles).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label="المعدات"
          className="field"
          value={tool}
          onChange={(e) => {
            setTool(e.target.value);
            setPage(0);
          }}
        >
          <option value="">كل المعدات</option>
          {Object.entries(equipment).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label="المستوى"
          className="field"
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            setPage(0);
          }}
        >
          <option value="">كل المستويات</option>
          <option value="beginner">مبتدئ</option>
          <option value="intermediate">متوسط</option>
          <option value="expert">متقدم</option>
        </select>
      </div>
      <div className="catalog-results-bar">
        <p role="status" aria-live="polite">
          <strong>{found.length}</strong> تمرين
          {activeFilters ? " يطابق البحث" : " في المكتبة"}
        </p>
        <div>
          <label className="visuals-filter">
            <input
              type="checkbox"
              checked={visualsOnly}
              onChange={(e) => {
                setVisualsOnly(e.target.checked);
                setPage(0);
              }}
            />
            بصور توضيحية فقط
          </label>
          {activeFilters && (
            <button type="button" className="reset-filters" onClick={reset}>
              مسح الفلاتر
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {!found.length ? (
        <div className="empty catalog-empty">
          <SlidersHorizontal size={32} />
          <h3>لا توجد تمارين مطابقة</h3>
          <p>غيّر اسم البحث أو وسّع عوامل التصفية.</p>
          <button className="btn-secondary" onClick={reset}>
            عرض جميع التمارين
          </button>
        </div>
      ) : (
        <div className="exercise-grid">
          {paged.map((e) => (
            <article key={e.id} className="movement-card">
              <button
                type="button"
                className="movement-open"
                onClick={() => setSelected(e)}
                aria-label={"تفاصيل " + exerciseName(e)}
              >
                <ExerciseVisual key={e.id} exercise={e} />
                <div className="movement-copy">
                  <h3>{exerciseName(e)}</h3>
                  <p className="movement-english" dir="ltr">
                    {e.name}
                  </p>
                </div>
              </button>
              <div className="movement-meta">
                <span>{muscles[e.primaryMuscles[0]] ?? "عضلات متعددة"}</span>
                <span>{equipment[e.equipment ?? ""] ?? "معدات متنوعة"}</span>
              </div>
              <div className="movement-footer">
                <button
                  type="button"
                  className="movement-details-link"
                  onClick={() => setSelected(e)}
                >
                  شرح الحركة
                  <ArrowLeft size={16} />
                </button>
                {onSelect ? (
                  <button
                    type="button"
                    className="exercise-add"
                    onClick={() => onSelect(e)}
                  >
                    <Plus size={17} />
                    {selectionLabel}
                  </button>
                ) : (
                  <span className="movement-level">
                    {
                      {
                        beginner: "مبتدئ",
                        intermediate: "متوسط",
                        expert: "متقدم",
                      }[e.level]
                    }
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
          {Math.min((currentPage + 1) * pageSize, found.length)} من{" "}
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
            السابق
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
            التالي
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
            aria-label={exerciseName(selected)}
            className="modal-sheet exercise-detail"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="exercise-detail-heading">
              <div>
                <h2>{exerciseName(selected)}</h2>
                <p dir="ltr">{selected.name}</p>
              </div>
              <button
                type="button"
                aria-label="إغلاق تفاصيل الحركة"
                className="icon-button"
                onClick={() => setSelected(null)}
              >
                <X size={22} />
              </button>
            </div>
            <ExerciseVisual
              key={selected.id}
              exercise={selected}
              playable
              className="exercise-detail-visual"
            />
            <div className="exercise-detail-body">
              <section className="exercise-anatomy">
                <div>
                  <h3>العضلات الرئيسية</h3>
                  <div className="muscle-tags">
                    {selected.primaryMuscles.map((m) => (
                      <span className="badge primary-muscle" key={m}>
                        {muscles[m] ?? m}
                      </span>
                    ))}
                  </div>
                </div>
                {selected.secondaryMuscles.length > 0 && (
                  <div>
                    <h3>العضلات المساعدة</h3>
                    <div className="muscle-tags">
                      {selected.secondaryMuscles.map((m) => (
                        <span className="badge" key={m}>
                          {muscles[m] ?? m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <h3>المعدات</h3>
                  <p>{equipment[selected.equipment ?? ""] ?? "معدات متنوعة"}</p>
                </div>
              </section>
              <section>
                <h3 className="instructions-heading">طريقة أداء التمرين</h3>
                <ol dir="rtl" className="exercise-instructions">
                  {exerciseInstructions(selected).map((line, index) => (
                    <li key={index}>
                      <span>{index + 1}</span>
                      <p>{line}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            {onSelect && (
              <div className="exercise-detail-action">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    onSelect(selected);
                    setSelected(null);
                  }}
                >
                  <Plus size={18} />
                  {embedded
                    ? "استخدم الحركة في برنامج جديد"
                    : "أضف الحركة للجدول"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
