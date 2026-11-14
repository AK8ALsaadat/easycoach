"use client";
import { useEffect,useState } from "react";
import { plans,type PlanCode,type PlatformState } from "@/lib/platform/plans";
export function PlatformTrialCountdown({end,serverNow,plan,limits}:{end:string;serverNow:string;plan:PlanCode;limits:PlatformState["limits"]}) {
  const initial=Math.max(0,Date.parse(end)-Date.parse(serverNow));
  const [remaining,setRemaining]=useState(initial);
  useEffect(()=>{
    const anchor=performance.now();
    const interval=setInterval(()=>setRemaining(Math.max(0,initial-(performance.now()-anchor))),1000);
    return ()=>clearInterval(interval);
  },[initial]);
  const days=Math.floor(remaining/86_400_000),hours=Math.floor(remaining%86_400_000/3_600_000),minutes=Math.floor(remaining%3_600_000/60_000);
  const selected=plans[plan];
  return <section className="border rounded-xl p-5 space-y-2" aria-label="الوقت المتبقي للتجربة">
    <p>المتبقي من مزايا Business المؤقتة: {days} يوم و{hours} ساعة و{minutes} دقيقة.</p>
    {remaining<=3*86_400_000&&<p>بعد التجربة تتغير الصلاحيات إلى {selected.name} عند تأكيد الدفع: {limits.clients??"غير محدود"} متدربًا و{limits.coaches} حسابات مدربين و{limits.templates??"غير محدود"} قوالب. إذا لم يتأكد الدفع تصبح الصلاحيات مجانية، وتبقى بياناتك محفوظة.</p>}
  </section>;
}
