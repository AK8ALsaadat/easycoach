import Link from "next/link";
import { Brand } from "@/components/brand";
import { plans, planCodes, sar } from "@/lib/platform/plans";
import { platformQuote } from "@/lib/platform/server";

export const dynamic = "force-dynamic";
export default async function PricingPage() {
  const quotes = await Promise.all(planCodes.map(async code => {
    try { return await platformQuote(code); } catch { return null; }
  }));
  return <main dir="rtl" className="mx-auto max-w-7xl space-y-8 px-5 py-10">
    <div className="flex items-center justify-between"><Brand /><Link href="/coach" className="btn">مساحة المدرب</Link></div>
    <header className="space-y-3 text-center"><h1>باقة تناسب مساحة تدريبك</h1><p className="text-muted">اشتراكك في EasyCoach مستقل عن باقات الحصص التي تبيعها للمتدربين.</p></header>
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{planCodes.map((code,index) => {
      const plan=plans[code], quote=quotes[index];
      return <article key={code} className="rounded-2xl border bg-[var(--ui-surface)] p-6 space-y-5 flex flex-col">
        <div className="flex justify-between items-center"><h2>{plan.name}</h2>{code==="pro" && <span className="rounded-full bg-accent px-3 text-sm">موصى بها</span>}</div>
        <div>{quote?.discount && quote.campaign_active && <del className="text-muted">{sar(quote.base_halalas)}</del>}{quote?<p><strong className="text-3xl">{sar(quote.net_halalas)}</strong> ريال / شهر</p>:<p role="status">يتعذر تحميل السعر حاليًا</p>}</div>
        {quote&&<p>{quote.limits.clients===null?"متدربون نشطون غير محدودين":`${quote.limits.clients} متدربًا نشطًا`}<br />{quote.limits.coaches} {quote.limits.coaches===1?"حساب مدرب":"حسابات مدربين شاملة المالك"}<br />القوالب الخاصة: {quote.limits.templates??"غير محدودة"}</p>}
        <ul className="space-y-2 grow">{plan.features.map(feature=><li key={feature}>✓ {feature}</li>)}</ul>
        {code!=="free" && <p className="text-sm text-muted">عند تفعيل التجربة: مزايا Business لمدة 14 يومًا، ثم مزايا {plan.name} بسعرها الموضح. رحلة البطاقة غير متاحة حاليًا.</p>}
        {code==="free" ? <Link className="btn btn-primary" href="/login">ابدأ مجانًا</Link> : <Link className="btn" href={`/subscription/confirm?plan=${code}`}>عرض تفاصيل الباقة</Link>}
      </article>;
    })}</div>
    <p className="rounded-xl border p-5 text-sm">الاشتراكات المدفوعة وتجربة البطاقة قيد التحقق لدى Paylink. رسائل البريد والتقارير المجدولة تُحفظ في طابور؛ الإرسال غير مفعّل لعدم توفر مزود بريد تشغيلي. لا يُعرض خصم إلا أثناء حملة معتمدة ومحددة المواعيد. المعالجة الضريبية والإجمالي يظهران قبل أي تأكيد.</p>
  </main>;
}

