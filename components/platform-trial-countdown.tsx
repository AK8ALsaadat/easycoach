"use client";
import { useEffect,useState } from "react";
import { plans,type PlanCode,type PlatformState } from "@/lib/platform/plans";
export function PlatformTrialCountdown({end,serverNow,plan,limits,hasPaymentMethod=false}:{end:string;serverNow:string;plan:PlanCode;limits:PlatformState["limits"];hasPaymentMethod?:boolean}) {
  const initial=Math.max(0,Date.parse(end)-Date.parse(serverNow));
  const [remaining,setRemaining]=useState(initial);
  useEffect(()=>{
    const anchor=performance.now();
    const interval=setInterval(()=>setRemaining(Math.max(0,initial-(performance.now()-anchor))),1000);
    return ()=>clearInterval(interval);
  },[initial]);
  const days=Math.floor(remaining/86_400_000),hours=Math.floor(remaining%86_400_000/3_600_000),minutes=Math.floor(remaining%3_600_000/60_000);
  const selected=plans[plan];
  const after=`${limits.clients??"بلا حد"} متدربًا و${limits.coaches} حسابات مدربين و${limits.templates??"بلا حد"} قوالب`;
  return <section className="trial-countdown" aria-label="الوقت المتبقي للتجربة">
    <h2>تجربتك المجانية جارية</h2>
    <div className="trial-countdown-units" dir="ltr"><span>{days}<small>يوم</small></span><span>{hours}<small>ساعة</small></span><span>{minutes}<small>دقيقة</small></span></div>
    <p>كل مزايا باقة الأعمال مفتوحة لك الآن. باقتك المختارة عند تفعيل اشتراكك المدفوع: {selected.name} ({after}).</p>
    {remaining<=3*86_400_000&&<p>{hasPaymentMethod
      ? `عند تأكيد الدفع تتحول صلاحياتك إلى ${selected.name}؛ وإن لم يتأكد تصبح الصلاحيات مجانية مع بقاء بياناتك محفوظة.`
      : "عند انتهاء التجربة تعود صلاحياتك إلى الباقة المجانية إلى أن تفعّل اشتراكك، وتبقى بياناتك ومتدربوك محفوظين."}</p>}
  </section>;
}
