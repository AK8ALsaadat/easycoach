"use client";
import { useState,useTransition } from "react";
import { organizationAction,type OrganizationOperation } from "@/app/organization-actions";
type Option={id:string;name:string};
type Field={name:string;label:string;type?:string;options?:Option[];optional?:boolean};
export function OrganizationForm({operation,fields,defaults={},label="حفظ"}:{operation:OrganizationOperation;fields:Field[];defaults?:Record<string,unknown>;label?:string}) {
  const [message,setMessage]=useState("");const [pending,start]=useTransition();
  return <form className="space-y-3" action={form=>start(async()=>{
    const input:Record<string,unknown>={...defaults};
    for(const field of fields){const v=String(form.get(field.name)??"");input[field.name]=field.optional&&!v?null:field.type==="number"?Number(v):field.type==="datetime-local"?new Date(v).toISOString():v;}
    const result=await organizationAction(operation,input);setMessage(result.message);
  })}>
    {fields.map(field=><label className="block text-sm" key={field.name}>{field.label}{field.options?<select className="field w-full" name={field.name} required={!field.optional}>{field.optional&&<option value="">بدون</option>}{field.options.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</select>:<input className="field w-full" type={field.type??"text"} name={field.name} required={!field.optional}/>}</label>)}
    <button className="btn" disabled={pending}>{label}</button><p role="status" className="text-sm">{message}</p>
  </form>;
}
export function BulkOperations({clients,members,branches,templates}:{clients:Option[];members:Option[];branches:Option[];templates:Option[]}) {
  const [selected,setSelected]=useState<string[]>([]),[preview,setPreview]=useState<{id:string;count:number;operation:string}|null>(null),[message,setMessage]=useState("");const [pending,start]=useTransition();
  return <section className="space-y-4"><h2>إجراءات جماعية</h2><p className="text-sm text-muted">النسخ من قالب ينشئ مسودة مستقلة ولا يستبدل أي مسودة قائمة. إشعارات البريد تُضاف للطابور؛ الإرسال غير مفعّل.</p>
    <div className="max-h-52 overflow-auto">{clients.map(c=><label key={c.id} className="flex gap-3"><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>{setPreview(null);setSelected(old=>e.target.checked?[...old,c.id]:old.filter(id=>id!==c.id));}}/>{c.name}</label>)}</div>
    <form className="space-y-3" action={form=>start(async()=>{
      const body={clients:selected,member:String(form.get("member")??"")||null,branch:String(form.get("branch")??"")||null,template:String(form.get("template")??"")||null,message:String(form.get("message")??"")};
      const result=await organizationAction("ec_bulk_preview",{operation:form.get("operation"),body});setMessage(result.message);
      setPreview(result.ok?result.data as {id:string;count:number;operation:string}:null);
    })} onChange={()=>setPreview(null)}>
      <label className="block">العملية<select className="field w-full" name="operation"><option value="assign">نقل وإسناد</option><option value="program">إنشاء برامج من قالب</option><option value="notify">إضافة إشعارات إلى طابور البريد</option></select></label>
      {([{key:"member",label:"المدرب",items:members},{key:"branch",label:"الفرع",items:branches},{key:"template",label:"قالب البرنامج",items:templates}]).map(f=><label className="block" key={f.key}>{f.label}<select className="field w-full" name={f.key}><option value="">بدون</option>{f.items.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>)}
      <label className="block">نص الإشعار<textarea className="field w-full" name="message" maxLength={2000}/></label><button className="btn" disabled={pending}>معاينة العملية</button>
    </form>
    {preview&&<div className="border p-4 rounded-xl space-y-3"><p>عدد المتدربين: {preview.count} · العملية: {({assign:"نقل وإسناد",program:"برامج جديدة",notify:"طابور بريد"})[preview.operation as "assign"]}</p><button className="btn btn-primary" disabled={pending} onClick={()=>start(async()=>{const r=await organizationAction("ec_bulk_apply",{preview:preview.id});setMessage(r.message);if(r.ok)setPreview(null);})}>تأكيد تنفيذ العملية</button></div>}
    <p role="status">{message}</p>
  </section>;
}
