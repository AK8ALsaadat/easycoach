"use client";
import { ExerciseIcon } from "./exercise-icon";
import { useDialog } from "./use-dialog";
import { useState, useDeferredValue } from "react";
import {
  Search,
  Plus,
  X,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  catalog,
  catalogSearch,
  muscles,
  equipment,
  exerciseName,
  exerciseInstructions,
  type CatalogExercise,
} from "@/lib/catalog";
export function ExerciseCatalog({
  onSelect,
  onClose,
}: {
  onSelect?: (e: CatalogExercise) => void;
  onClose?: () => void;
}) {
  const [query, setQuery] = useState(""),
    [muscle, setMuscle] = useState(""),
    [tool, setTool] = useState(""),
    [level, setLevel] = useState(""),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<CatalogExercise | null>(null);
  const dialogRef = useDialog(Boolean(selected), () => setSelected(null));
  const deferred = useDeferredValue(query);
  const found = catalog.filter(
    (e) =>
      (!muscle || e.primaryMuscles.includes(muscle)) &&
      (!tool || e.equipment === tool) &&
      (!level || e.level === level) &&
      catalogSearch(e, deferred),
  );
  const paged = found.slice(page * 18, page * 18 + 18);
  return (
    <section className="catalog-panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">مكتبة التمارين · {catalog.length} حركة</p>
          <h2>تمارين تناسب كل برنامج</h2>
        </div>
        {onClose ? (
          <button className="btn-secondary" onClick={onClose}>
            <X size={16} />
            إغلاق
          </button>
        ) : (
          <span className="badge">{found.length} حركة</span>
        )}
      </div>
      <div className="catalog-filters">
        <div className="relative">
          <Search size={17} className="absolute end-3 top-3.5 text-muted" />
          <input
            aria-label="ابحث في التمارين"
            placeholder="بنش، صدر، دمبل، Bench press…"
            className="field pe-10"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
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
          {Object.entries(muscles).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
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
          {Object.entries(equipment).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
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
      {!found.length ? (
        <div className="empty">
          <SlidersHorizontal />
          <p>لا توجد نتائج. جرّب اسمًا آخر أو غيّر عوامل التصفية.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {paged.map((e) => (
            <article key={e.id} className="movement-card">
              <button
                onClick={() => setSelected(e)}
                className="block w-full text-start"
              >
                <div className="movement-image">
                  <ExerciseIcon exercise={e} />
                  <span>{muscles[e.primaryMuscles[0]]}</span>
                </div>
                <div className="px-4 pt-3">
                  <h3 className="text-sm font-bold">{exerciseName(e)}</h3>
                  <p
                    dir="ltr"
                    className="mt-1 truncate text-start text-[11px] text-muted"
                  >
                    {e.name}
                  </p>
                </div>
              </button>
              <div className="flex items-center justify-between gap-2 p-4">
                <span className="text-xs text-muted">
                  {equipment[e.equipment ?? ""] ?? "متنوع"}
                </span>
                {onSelect ? (
                  <button
                    type="button"
                    className="btn-soft"
                    onClick={() => onSelect(e)}
                  >
                    <Plus size={15} />
                    للجدول
                  </button>
                ) : (
                  <button
                    className="text-xs font-bold text-teal"
                    onClick={() => setSelected(e)}
                  >
                    تفاصيل الحركة ←
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-muted">
          {Math.min(page * 18 + 1, found.length)}–
          {Math.min(page * 18 + 18, found.length)} من {found.length}
        </span>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronRight size={16} />
            السابق
          </button>
          <button
            className="btn-secondary"
            disabled={(page + 1) * 18 >= found.length}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>
      {selected ? (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={exerciseName(selected)}
            className="modal-sheet max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-title">
              <h2>{exerciseName(selected)}</h2>
              <button
                aria-label="إغلاق تفاصيل الحركة"
                className="btn-secondary"
                onClick={() => setSelected(null)}
              >
                <X size={18} />
              </button>
            </div>
            <ExerciseIcon
              exercise={selected}
              className="exercise-detail-icon"
            />
            <div className="my-4 flex flex-wrap gap-2">
              {selected.primaryMuscles.map((m) => (
                <span className="badge" key={m}>
                  {muscles[m]}
                </span>
              ))}
              <span className="badge">
                {equipment[selected.equipment ?? ""]}
              </span>
            </div>
            <ol
              dir="rtl"
              className="exercise-instructions list-inside list-decimal space-y-3 text-sm leading-7 text-muted"
            >
              {exerciseInstructions(selected).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
            {onSelect ? (
              <button
                className="btn mt-6 w-full"
                onClick={() => {
                  onSelect(selected);
                  setSelected(null);
                }}
              >
                أضف الحركة للجدول
                <Plus size={16} />
              </button>
            ) : null}
            <p className="mt-4 text-[10px] text-muted">
              رسم توضيحي لنمط الحركة · اتبع تعليمات مدربك للوزن والعدات ومدى
              الحركة.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
