"use client";
import {useMemo,useRef,useState} from "react";
import { countLabel, nouns } from "@/lib/plural";
import {Search,Plus,X,Check,ArrowLeft,ChevronLeft,ChevronRight,SlidersHorizontal,Expand,Dumbbell} from "lucide-react";
import {catalog,catalogSearch,muscles,equipment,exerciseName,type CatalogExercise} from "@/lib/catalog";
import {ExerciseVisual} from "./exercise-visual";
import {useLocale} from "./locale-provider";
import {useDialog} from "./use-dialog";

const pageSize=24;
export function ExerciseCatalog({onConfirm,onClose,embedded=false,dropDays=[],initialDropDay=0}:{onConfirm:(exercises:CatalogExercise[],day:number)=>boolean|void;onClose?:()=>void;embedded?:boolean;dropDays?:{name:string;count:number}[];initialDropDay?:number}){
  const {t:tr,language}=useLocale();
  const [query,setQuery]=useState("");const [muscle,setMuscle]=useState("");const [tool,setTool]=useState("");
  const [page,setPage]=useState(0);const [visuals,setVisuals]=useState(true);const [target,setTarget]=useState(initialDropDay);
  const [chosen,setChosen]=useState<CatalogExercise[]>([]);const [preview,setPreview]=useState<CatalogExercise|null>(null);const [error,setError]=useState("");
  const committed=useRef(false);const previewRef=useDialog(Boolean(preview),()=>setPreview(null));
  const builder=dropDays.length>0,targetIndex=Math.max(0,Math.min(target,dropDays.length-1));
  const available=builder?Math.max(0,40-dropDays[targetIndex].count):40;
  const found=useMemo(()=>catalog.filter(e=>(!muscle||e.primaryMuscles.includes(muscle))&&(!tool||e.equipment===tool)&&catalogSearch(e,query)),[query,muscle,tool]);
  const pages=Math.max(1,Math.ceil(found.length/pageSize)),current=Math.min(page,pages-1);
  const selected=new Set(chosen.map(e=>e.id));const full=chosen.length>=available;
  function toggle(exercise:CatalogExercise){committed.current=false;setError("");setChosen(rows=>rows.some(e=>e.id===exercise.id)?rows.filter(e=>e.id!==exercise.id):rows.length<available?[...rows,exercise]:rows);}
  function confirm(){
    if(!chosen.length||chosen.length>available||committed.current)return;
    committed.current=true;
    if(onConfirm(chosen,builder?targetIndex:0)===false){committed.current=false;setError(tr("تعذر إضافة المجموعة. تحقق من المساحة المتاحة في اليوم."));return;}
    setChosen([]);setError("");onClose?.();
  }
  const clearFilters=()=>{setQuery("");setMuscle("");setTool("");setPage(0);};
  return <section className={`exercise-picker ${builder?"is-builder":"is-library"}`} aria-label={tr("اختيار التمارين")}>
    <header className="picker-heading"><div><span className="eyebrow">{tr("مكتبتك التدريبية")}</span><h2>{tr("اختر تمارين الحصة")}</h2><p>{tr("حدد التمارين بالترتيب الذي تريده، ثم أضف المجموعة مرة واحدة.")}</p></div>{onClose&&<button type="button" className="icon-button" aria-label={tr("إغلاق اختيار التمارين")} onClick={onClose}><X size={21}/></button>}</header>
    {builder&&<div className="picker-destination"><div><Dumbbell size={17}/><span>{tr("أضف إلى حصة")}</span></div><div className="picker-day-tabs" role="group" aria-label={tr("اليوم المستهدف")}>{dropDays.map((day,index)=><button type="button" key={index} className={targetIndex===index?"selected":""} aria-pressed={targetIndex===index} onClick={()=>{setTarget(index);setError("");committed.current=false;}}><span>{day.name}</span><small>{day.count}/40</small></button>)}</div></div>}
    <div className="picker-tools"><div className="picker-search"><Search size={20}/><input data-picker-search aria-label={tr("ابحث في التمارين")} placeholder={tr("ابحث باسم التمرين بالعربية أو الإنجليزية…")} value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/>{query&&<button type="button" aria-label={tr("مسح البحث")} onClick={()=>{setQuery("");setPage(0);}}><X size={17}/></button>}</div><select className="field" aria-label={tr("العضلة")} value={muscle} onChange={event=>{setMuscle(event.target.value);setPage(0);}}><option value="">{tr("كل العضلات")}</option>{Object.entries(muscles).map(([key,name])=><option value={key} key={key}>{tr(name)}</option>)}</select><select className="field" aria-label={tr("المعدات")} value={tool} onChange={event=>{setTool(event.target.value);setPage(0);}}><option value="">{tr("كل المعدات")}</option>{Object.entries(equipment).map(([key,name])=><option value={key} key={key}>{tr(name)}</option>)}</select></div>
    <div className="picker-scroll"><div className="picker-results"><span>{tr("النتائج: {0}",countLabel(language,found.length,nouns.exercise))}</span><div>{(query||muscle||tool)&&<button type="button" onClick={clearFilters}>{tr("مسح الفلاتر")}</button>}<label><input type="checkbox" checked={visuals} onChange={event=>setVisuals(event.target.checked)}/>{tr("عرض الصور")}</label></div></div>
      {!found.length?<div className="empty"><SlidersHorizontal size={30}/><h3>{tr("لا توجد تمارين مطابقة")}</h3><button className="btn-soft" type="button" onClick={clearFilters}>{tr("عرض جميع التمارين")}</button></div>:<div className={`picker-grid ${visuals?"":"compact"}`}>{found.slice(current*pageSize,(current+1)*pageSize).map(exercise=>{
        const active=selected.has(exercise.id);const order=chosen.findIndex(e=>e.id===exercise.id)+1;
        return <article className={`picker-card ${active?"selected":""}`} key={exercise.id} data-catalog-id={exercise.id}>
          <button type="button" className="picker-card-select" aria-pressed={active} aria-label={tr("اختيار {0}",exerciseName(exercise,language))} disabled={!active&&full} onClick={()=>toggle(exercise)}>{visuals&&<ExerciseVisual exercise={exercise}/>}<span className="picker-check" aria-hidden="true">{active?<Check size={17}/>:<Plus size={17}/>}</span><span className="picker-card-copy"><strong>{exerciseName(exercise,language)}</strong><small dir="ltr">{exercise.name}</small><span className="picker-meta">{tr(muscles[exercise.primaryMuscles[0]]??"عضلات متعددة")} · {tr(equipment[exercise.equipment??""]??"معدات متنوعة")}</span></span></button>
          <div className="picker-card-bottom"><span>{active?tr("الاختيار {0}",String(order)):tr("اضغط للاختيار")}</span><button type="button" className="picker-preview" aria-label={tr("معاينة صورة {0}",exerciseName(exercise,language))} onClick={()=>setPreview(exercise)}><Expand size={14}/>{tr("معاينة")}</button></div>
        </article>;
      })}</div>}
      <div className="picker-pagination"><span>{found.length?current*pageSize+1:0}–{Math.min((current+1)*pageSize,found.length)} / {found.length}</span><div><button className="icon-button" type="button" aria-label={tr("السابق")} disabled={current===0} onClick={()=>setPage(current-1)}><ChevronRight size={18}/></button><span>{current+1} / {pages}</span><button className="icon-button" type="button" aria-label={tr("التالي")} disabled={current+1>=pages} onClick={()=>setPage(current+1)}><ChevronLeft size={18}/></button></div></div>
    </div>
    <footer className={`picker-footer ${embedded?"embedded":""}`}><div className="picker-selection"><strong aria-live="polite">{tr("التمارين المحددة: {0}",String(chosen.length))}</strong><span>{builder?`${tr("الوجهة")}: ${dropDays[targetIndex].name}`:tr("برنامج جديد من اختياراتك")}</span>{chosen.length>0&&<div className="picker-selected-tags">{chosen.map(exercise=><button type="button" key={exercise.id} onClick={()=>toggle(exercise)} aria-label={tr("إلغاء اختيار {0}",exerciseName(exercise,language))}>{exerciseName(exercise,language)}<X size={12}/></button>)}</div>}{(error||chosen.length>available||available===0)&&<p role="alert">{error||tr("المتاح في هذه الحصة: {0}. أزل بعض الاختيارات أو غيّر اليوم.",String(available))}</p>}</div><div className="picker-submit"><button type="button" className="btn" disabled={!chosen.length||chosen.length>available} onClick={confirm}><Plus size={18}/>{builder?tr("إضافة المحدد ({0})",String(chosen.length)):tr("إنشاء البرنامج ({0})",String(chosen.length))}<ArrowLeft size={16}/></button>{chosen.length>0&&<button className="picker-clear" type="button" onClick={()=>{setChosen([]);setError("");committed.current=false;}}>{tr("مسح الاختيار")}</button>}</div></footer>
    {preview&&<div className="modal-backdrop" onClick={()=>setPreview(null)}><div className="modal-sheet exercise-photo-preview" ref={previewRef} role="dialog" aria-modal="true" aria-label={tr("معاينة صورة {0}",exerciseName(preview,language))} tabIndex={-1} onClick={event=>event.stopPropagation()}><header><div><h2>{exerciseName(preview,language)}</h2><p dir="ltr">{preview.name}</p></div><button type="button" className="icon-button" aria-label={tr("إغلاق المعاينة")} onClick={()=>setPreview(null)}><X size={21}/></button></header><ExerciseVisual exercise={preview} playable className="exercise-detail-visual"/><div className="picker-preview-meta">{preview.primaryMuscles.map(muscle=><span key={muscle} className="badge">{tr(muscles[muscle]??muscle)}</span>)}<span className="badge">{tr(equipment[preview.equipment??""]??"معدات متنوعة")}</span></div></div></div>}
  </section>;
}
