"use client";
import { Plus, CalendarDays, Copy, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { displayDayName } from "@/lib/program-builder";
import { countLabel, nouns } from "@/lib/plural";
import type { Content } from "@/lib/model";
import { useLocale } from "./locale-provider";

export function ProgramDayNav({
  days,
  selected,
  onSelect,
  onAdd,
  onRepeat,
  onDelete,
  onMove,
}: {
  days: Content["days"];
  selected: number;
  onSelect: (day: number) => void;
  onAdd: () => void;
  onRepeat: (day: number) => void;
  /** Deleting the last remaining day is refused by the caller. */
  onDelete: (day: number) => void;
  onMove: (day: number, direction: -1 | 1) => void;
}) {
  const { t: tr, language } = useLocale();
  const weekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  return (
    <aside className="program-day-nav" aria-label={tr("أيام البرنامج")}>
      <div className="program-nav-heading">
        <CalendarDays size={18} />
        <h3>{tr("أيام البرنامج")}</h3>
        <span className="badge">{days.length}</span>
      </div>
      <p className="program-nav-hint">{tr("اختر اليوم، أضف التمارين، ثم اضبط الجرعات. ترتيب الأيام وحذفها من الأزرار جانب كل يوم.")}</p>
      <div className="program-day-list">
        {days.map((day, index) => (
          <div className="program-day-row" key={index}>
            <button
              type="button"
              aria-label={displayDayName(day.name, language)}
              aria-pressed={selected === index}
              className={`program-day-item ${selected === index ? "selected" : ""}`}
              onClick={() => onSelect(index)}
            >
              <span className="program-day-number">{index + 1}</span>
              <span>
                <strong>{displayDayName(day.name, language)}</strong>
                <small>{day.weekday === undefined ? tr("بدون يوم محدد") : tr(weekdays[day.weekday])}</small>
              </span>
              <span className={`badge ${!day.exercises.length ? "program-day-empty" : ""}`}>
                {countLabel(language, day.exercises.length, nouns.exercise)}
              </span>
            </button>
            <div className="program-day-tools">
              <button
                type="button"
                className="program-day-tool"
                disabled={index === 0}
                aria-label={tr("تحريك {0} للأعلى", day.name)}
                title={tr("تحريك للأعلى")}
                onClick={() => onMove(index, -1)}
              >
                <ChevronUp size={15} />
              </button>
              <button
                type="button"
                className="program-day-tool"
                disabled={index === days.length - 1}
                aria-label={tr("تحريك {0} للأسفل", day.name)}
                title={tr("تحريك للأسفل")}
                onClick={() => onMove(index, 1)}
              >
                <ChevronDown size={15} />
              </button>
              <button
                type="button"
                className="program-repeat-day"
                disabled={days.length >= 14}
                aria-label={tr("تكرار {0}", day.name)}
                title={tr("تكرار {0}", day.name)}
                onClick={() => onRepeat(index)}
              >
                <Copy size={15} />
              </button>
              <button
                type="button"
                className="program-day-tool program-day-delete"
                disabled={days.length === 1}
                aria-label={tr("حذف {0}", day.name)}
                title={days.length === 1 ? tr("لازم يبقى يوم واحد على الأقل") : tr("حذف {0}", day.name)}
                onClick={() => onDelete(index)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn-secondary program-add-day" disabled={days.length >= 14} onClick={onAdd}>
        <Plus size={16} />
        {tr("إضافة يوم")}
      </button>
    </aside>
  );
}
