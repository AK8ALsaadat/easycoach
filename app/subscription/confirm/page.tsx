import Link from "next/link";
import { notFound } from "next/navigation";
import { isPlan, plans, sar } from "@/lib/platform/plans";
import { platformQuote, platformState } from "@/lib/platform/server";

export const dynamic="force-dynamic";
export default async function ConfirmPage({searchParams}:{searchParams:Promise<{plan?:string}>}) {
  const {plan}=await searchParams;
  if(!isPlan(plan)||plan==="free") notFound();
  const [quote,state]=await Promise.all([platformQuote(plan),platformState()]);
  return <main dir="rtl" className="mx-auto max-w-2xl p-6 space-y-6">
    <Link href="/pricing">← الباقات</Link><h1>تفاصيل الاشتراك في {plans[plan].name}</h1>
    <section className="rounded-2xl border p-6 space-y-4">
      <p>الباقة بعد التجربة: <strong>{plans[plan].name}</strong></p>
      <p>السعر الشهري: <strong>{sar(quote.net_halalas)} ريال</strong></p>
      <p>الضريبة: {quote.tax_mode==="unconfigured"?"لم تُحدد إعدادات التسجيل الضريبي للمشغّل بعد":quote.tax_mode==="not_registered"?"غير مسجل بحسب إعدادات المشغّل":`${sar(quote.vat_halalas ?? 0)} ريال (${quote.tax_mode==="inclusive"?"مشمولة":"تضاف للسعر"})`}</p>
      <p>الإجمالي: {quote.total_halalas===null?"بانتظار ضبط الضريبة":`${sar(quote.total_halalas)} ريال شهريًا`}</p>
      <p>مزايا التجربة المؤقتة: Business لمدة 14 × 24 ساعة من تأكيد جاهزية وسيلة الدفع والتفويض لدى المزود.</p>
      <p>تاريخ أول خصم: {state.trial_end?new Intl.DateTimeFormat("ar-SA",{dateStyle:"long",timeStyle:"short",timeZone:"Asia/Riyadh"}).format(new Date(state.trial_end))+" — توقيت الرياض":"لم يُحدد؛ لم تبدأ تجربة ولم تُجهّز بطاقة"}</p>
    </section>
    <p role="status" className="rounded-xl border p-5">التفعيل معطل لحين إثبات دعم Paylink لحفظ البطاقة دون خصم أو حجز وتأجيل أول خصم والإلغاء الفعلي. لم يبدأ اشتراك أو تجديد تلقائي.</p>
    <Link href="/subscription" className="btn">إدارة الاشتراك الحالي</Link>
  </main>;
}

