"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Headset, Lightbulb, Bug, X, ImagePlus, Send, RefreshCw } from "lucide-react";

type Ticket = { id:string; kind:string; title:string; description:string; attachment_path?:string|null; status:string; created_at:string; author_name?:string; profiles?:{name?:string} };
export function SupportDesk({ owner = false }: { owner?:boolean }) {
 const [open,setOpen]=useState(false); const [kind,setKind]=useState("bug"); const [file,setFile]=useState<File|null>(null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const router=useRouter();
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const formElement=e.currentTarget;setBusy(true);setMessage("");const form=new FormData(formElement);form.set("kind",kind);if(file)form.set("image",file);try{const res=await fetch("/api/support/tickets",{method:"POST",body:form});const json=await res.json();if(!res.ok){setMessage(json.error??"تعذر الإرسال");return;}setMessage("وصلنا طلبك، شكرًا لك.");formElement.reset();setFile(null);router.refresh();}catch{setMessage("تعذر الاتصال. احتفظ بالنص وحاول مرة أخرى.");}finally{setBusy(false);}}
 return <>
  {owner&&<SupportInbox/>}
  <button type="button" onClick={()=>setOpen(true)} aria-label="الدعم والاقتراحات" title="الدعم والاقتراحات" className="support-fab"><Headset size={23}/></button>
  {open&&<div className="support-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section role="dialog" aria-modal="true" aria-labelledby="support-title" className="support-dialog">
    <header className="flex items-start justify-between gap-4"><div><h2 id="support-title">كيف نقدر نساعدك؟</h2><p className="text-sm text-muted mt-1">أرسل اقتراح ميزة أو بلاغًا عن مشكلة، ويمكنك إرفاق صورة.</p></div><button className="icon-button" aria-label="إغلاق" onClick={()=>setOpen(false)}><X size={19}/></button></header>
    <div className="support-types"><button type="button" className={kind==="bug"?"selected":""} onClick={()=>setKind("bug")}><Bug size={17}/> بلاغ عن مشكلة</button><button type="button" className={kind==="suggestion"?"selected":""} onClick={()=>setKind("suggestion")}><Lightbulb size={17}/> اقتراح ميزة</button></div>
    <form onSubmit={submit} className="support-form"><label>عنوان مختصر<input name="title" required minLength={4} maxLength={120} placeholder="مثال: لا أستطيع حفظ التمرين" /></label><label>التفاصيل<textarea name="description" required minLength={10} maxLength={5000} rows={5} placeholder="اشرح ما حدث والخطوات التي أوصلتك للمشكلة..." /></label>
      <label className="support-attach"><ImagePlus size={18}/><span>{file?file.name:"إرفاق صورة (اختياري)"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]??null)} /></label>{file&&<button type="button" className="text-xs underline" onClick={()=>setFile(null)}>إزالة الصورة</button>}
      {message&&<p role="status" className="text-sm">{message}</p>}<button className="btn" disabled={busy}>{busy?<RefreshCw className="animate-spin" size={17}/>:<Send size={17}/>} {busy?"جارٍ الإرسال…":"إرسال الطلب"}</button></form>
  </section></div>}
 </>;
}
function SupportInbox(){const [tickets,setTickets]=useState<Ticket[]>([]);const [loaded,setLoaded]=useState(false);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 async function load(){setBusy(true);setError("");const r=await fetch("/api/support/tickets",{cache:"no-store"});const j=await r.json();setBusy(false);setLoaded(true);if(!r.ok){setError(j.error??"تعذر التحميل");return;}setTickets(j.tickets??[]);}
 async function status(id:string,value:string){await fetch(`/api/support/tickets/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:value})});void load();}
 return <section className="support-inbox card"><div className="flex justify-between items-center gap-3"><div><h2>صندوق الدعم</h2><p className="text-sm text-muted">التذاكر مرئية لحساب مالك المنصة فقط.</p></div><button className="btn-secondary" onClick={()=>void load()}>{busy?<RefreshCw size={16}/>:"عرض التذاكر"}</button></div>{error&&<p role="alert" className="mt-4">{error}</p>}{loaded&&tickets.length===0&&<p className="text-muted mt-5">لا توجد تذاكر حتى الآن.</p>}{tickets.map(t=><article className="support-ticket" key={t.id}><div className="flex justify-between gap-3"><div><strong>{t.kind==="bug"?"بلاغ مشكلة":"اقتراح ميزة"}: {t.title}</strong><p className="text-xs text-muted">{t.author_name??t.profiles?.name??"مستخدم"} · {new Date(t.created_at).toLocaleString("ar-SA")}</p></div><select aria-label="حالة الطلب" value={t.status} onChange={e=>void status(t.id,e.target.value)}><option value="open">جديد</option><option value="in_progress">قيد المعالجة</option><option value="resolved">تم الحل</option><option value="closed">مغلق</option></select></div><p className="mt-3 whitespace-pre-wrap text-sm">{t.description}</p>{t.attachment_path&&<a className="underline text-sm" target="_blank" rel="noreferrer" href={`/api/support/attachments/${t.id}`}>عرض الصورة المرفقة</a>}</article>)}</section>
}
