"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { manage } from "@/app/management-actions";
import type { Result } from "@/app/actions";
import { recordSchemas } from "@/lib/management";
import { riyadhToday } from "@/lib/dates";
import type { Client, Snapshot } from "@/lib/model";
import { clientInsights } from "@/lib/client-insights";
import { Notice } from "./forms";
import { useLocale } from "./locale-provider";
import { useUnsavedChanges } from "./use-unsaved-changes";

export function NutritionTargetEditor({data,client}:{data:Snapshot;client:Client}) {
  const {t:tr}=useLocale();const router=useRouter();const current=clientInsights(data,client.id).nutrition;
  const [values,setValues]=useState({calories:current?.calories??0,protein:current?.protein??0,carbs:current?.carbs??0,fat:current?.fat??0});
  const [text,setText]=useState(current?.text??"");const [day,setDay]=useState(riyadhToday());
  const [dirty,setDirty]=useState(false);const [busy,setBusy]=useState(false);const [result,setResult]=useState<Result|null>(null);
  const request=useRef<string|null>(null);const locked=useRef(false);
  useUnsavedChanges(dirty);
  const changed=()=>{setDirty(true);setResult(null);};
  return <section className="card p-5 sm:p-7" data-testid="nutrition-target-editor"><h2>{tr("تعديل سعرات المتدرب والماكروز")}</h2><p className="mt-2 text-sm text-muted">{tr("احفظ هدف التغذية بتاريخ سريان مستقل؛ يبقى جدول التمارين محفوظًا.")}</p>
    <form className="mt-6 space-y-5" onSubmit={async event=>{
      event.preventDefault();if(locked.current||!dirty)return;
      const checked=recordSchemas.nutrition_target.safeParse({...values,text,...(current?.meals?{meals:current.meals}:{})});
      if(!checked.success){setResult({ok:false,message:"تحقق من السعرات والماكروز وملاحظات التغذية."});return;}
      locked.current=true;setBusy(true);setResult(null);
      try{const response=await manage("record_save",{id:request.current??=crypto.randomUUID(),client_id:client.id,kind:"nutrition_target",entry_date:day,payload:checked.data});setResult(response);if(response.ok){request.current=null;setDirty(false);router.refresh();}}
      catch{setResult({ok:false,message:"تعذر الاتصال. لم نتأكد من الحفظ؛ أعد المحاولة بنفس البيانات."});}
      finally{locked.current=false;setBusy(false);}
    }}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{([['calories','السعرات (kcal)',10000],['protein','البروتين (غ)',1000],['carbs','الكارب (غ)',1000],['fat','الدهون (غ)',1000]] as const).map(([key,label,max])=><label key={key}>{tr(label)}<input className="field mt-2" type="number" dir="ltr" min={0} max={max} step="any" required disabled={busy} value={values[key]} onChange={event=>{setValues(old=>({...old,[key]:Number(event.target.value)}));changed();}}/></label>)}</div>
      <label className="block max-w-sm">{tr("تاريخ سريان السعرات")}<input className="field mt-2" type="date" required value={day} disabled={busy} onChange={event=>{setDay(event.target.value);changed();}}/></label>
      <p className="text-xs text-muted">{tr("الهدف المؤرخ مستقبلًا يبدأ في تاريخه؛ يبقى الهدف الحالي فعالًا حتى ذلك الوقت.")}</p>
      <label className="block">{tr("ملاحظات التغذية")}<textarea className="field mt-2 min-h-32" maxLength={4000} value={text} disabled={busy} onChange={event=>{setText(event.target.value);changed();}}/></label>
      <div className="flex flex-wrap gap-3"><button className="btn" type="submit" disabled={busy||!dirty}>{tr(busy?"جارٍ الحفظ…":"حفظ السعرات للمتدرب")}</button><Link className="btn-secondary" href={`/coach/clients/${client.id}`}>{tr("العودة لملخص المتدرب")}</Link></div><Notice result={result}/>
    </form>
  </section>;
}
