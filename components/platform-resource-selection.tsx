"use client";
import { useState, useTransition } from "react";
import { selectPlatformResources,platformResourcePage } from "@/app/platform-actions";
type Resource={id:string;name:string};
export function PlatformResourceSelection({clients,templates,selectedClients,selectedTemplates,nextClient,nextTemplate}:{clients:Resource[];templates:Resource[];selectedClients:string[]|null;selectedTemplates:string[]|null;nextClient:string|null;nextTemplate:string|null}) {
  const [selection,setSelection]=useState({clients:selectedClients??[],templates:selectedTemplates??[]});
  const [resources,setResources]=useState({clients,templates,next_client:nextClient,next_template:nextTemplate});
  const [message,setMessage]=useState(""); const [pending,start]=useTransition();
  return <form className="space-y-4" action={()=>start(async()=>{const result=await selectPlatformResources(selection);setMessage(result.message);})}>
    {(["clients","templates"] as const).map(kind=><fieldset key={kind} className="border rounded-xl p-4"><legend>{kind==="clients"?"المتدربون الذين سيبقون نشطين":"القوالب التي ستبقى نشطة"}</legend><div className="max-h-64 overflow-auto space-y-2">{resources[kind].map(item=><label key={item.id} className="flex gap-3"><input type="checkbox" checked={selection[kind].includes(item.id)} onChange={e=>setSelection(old=>({...old,[kind]:e.target.checked?[...old[kind],item.id]:old[kind].filter(id=>id!==item.id)}))}/>{item.name}</label>)}</div>{resources[kind==="clients"?"next_client":"next_template"]&&<button type="button" className="btn" disabled={pending} onClick={()=>start(async()=>{try{const page=await platformResourcePage(kind==="clients"?resources.next_client:null,kind==="templates"?resources.next_template:null);setResources(old=>({...old,[kind]:[...old[kind],...page[kind]],[kind==="clients"?"next_client":"next_template"]:page[kind==="clients"?"next_client":"next_template"]}));}catch{setMessage("تعذر تحميل الصفحة. حاول مجددًا");}})}>تحميل المزيد</button>}</fieldset>)}
    <p>تبقى بقية السجلات محفوظة ومقفلة دون حذف.</p><button className="btn btn-primary" disabled={pending}>حفظ الاختيار</button><p role="status">{message}</p>
  </form>;
}

