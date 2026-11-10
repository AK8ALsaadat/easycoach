"use client";
import { Plus, CalendarDays } from "lucide-react";
import type { Content } from "@/lib/model";
import { useLocale } from "./locale-provider";

export function ProgramDayNav({days,selected,onSelect,onAdd}:{days:Content["days"];selected:number;onSelect:(day:number)=>void;onAdd:()=>void}) {
  const {t:tr}=useLocale();
  const weekdays=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
  return <aside className="program-day-nav" aria-label={tr("أيام البرنامج")}>
    <div className="program-nav-heading"><CalendarDays size={18}/><h3>{tr("أيام البرنامج")}</h3><span className="badge">{days.length}</span></div>
    <p className="program-nav-hint">{tr("اختر اليوم، أضف التمارين، ثم اضبط الجرعات.")}</p>
    <div className="program-day-list">{days.map((day,index)=><button type="button" key={index} aria-label={day.name} aria-pressed={selected===index} className={`program-day-item ${selected===index?"selected":""}`} onClick={()=>onSelect(index)}>
      <span className="program-day-number">{index+1}</span><span><strong>{day.name}</strong><small>{day.weekday===undefined?tr("بدون يوم محدد"):tr(weekdays[day.weekday])}</small></span><span className={`badge ${!day.exercises.length?"program-day-empty":""}`}>{day.exercises.length} {tr("تمارين")}</span>
    </button>)}</div>
    <button type="button" className="btn-secondary program-add-day" disabled={days.length>=14} onClick={onAdd}><Plus size={16}/>{tr("إضافة يوم")}</button>
  </aside>;
}
