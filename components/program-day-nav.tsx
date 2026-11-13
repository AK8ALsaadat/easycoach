"use client";
import { Plus, CalendarDays, Copy } from "lucide-react";
import { displayDayName } from "@/lib/program-builder";
import { countLabel, nouns } from "@/lib/plural";
import type { Content } from "@/lib/model";
import { useLocale } from "./locale-provider";

export function ProgramDayNav({days,selected,onSelect,onAdd,onRepeat}:{days:Content["days"];selected:number;onSelect:(day:number)=>void;onAdd:()=>void;onRepeat:(day:number)=>void}) {
  const {t:tr,language}=useLocale();
  const weekdays=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
  return <aside className="program-day-nav" aria-label={tr("أيام البرنامج")}>
    <div className="program-nav-heading"><CalendarDays size={18}/><h3>{tr("أيام البرنامج")}</h3><span className="badge">{days.length}</span></div>
    <p className="program-nav-hint">{tr("اختر اليوم، أضف التمارين، ثم اضبط الجرعات.")}</p>
    <div className="program-day-list">{days.map((day,index)=><div className="program-day-row" key={index}><button type="button" aria-label={displayDayName(day.name,language)} aria-pressed={selected===index} className={`program-day-item ${selected===index?"selected":""}`} onClick={()=>onSelect(index)}>
      <span className="program-day-number">{index+1}</span><span><strong>{displayDayName(day.name,language)}</strong><small>{day.weekday===undefined?tr("بدون يوم محدد"):tr(weekdays[day.weekday])}</small></span><span className={`badge ${!day.exercises.length?"program-day-empty":""}`}>{countLabel(language, day.exercises.length, nouns.exercise)}</span>
    </button><button type="button" className="program-repeat-day" disabled={days.length>=14} aria-label={tr("تكرار {0}",day.name)} title={tr("تكرار {0}",day.name)} onClick={()=>onRepeat(index)}><Copy size={15}/></button></div>)}</div>
    <button type="button" className="btn-secondary program-add-day" disabled={days.length>=14} onClick={onAdd}><Plus size={16}/>{tr("إضافة يوم")}</button>
  </aside>;
}
