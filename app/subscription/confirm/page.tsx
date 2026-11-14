import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check } from "lucide-react";
import { Brand } from "@/components/brand";
import { startTrialAction } from "@/app/platform-actions";
import { isPlan, limitLabel, plans, riyadhDate, riyals, sar } from "@/lib/platform/plans";
import { platformQuote, platformState } from "@/lib/platform/server";
import { actor } from "@/lib/server";

export const dynamic = "force-dynamic";
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  if (!isPlan(plan) || plan === "free") notFound();
  const user = await actor();
  if (!user) redirect(`/login?register=1&next=${encodeURIComponent(`/start?plan=${plan}`)}`);
  const [quote, state] = await Promise.all([platformQuote(plan), platformState().catch(() => null)]);
  const trialEnd = new Date(Date.parse(quote.server_now) + quote.trial_days * 86_400_000).toISOString();
  const tax = quote.tax_mode === "unconfigured" ? "تُحدد المعالجة الضريبية وتُعرض قبل أي خصم" : quote.tax_mode === "not_registered" ? "غير مسجل ضريبيًا بحسب إعدادات المشغّل" : `${sar(quote.vat_halalas ?? 0)} ريال (${quote.tax_mode === "inclusive" ? "مشمولة" : "تضاف للسعر"})`;
  return <main dir="rtl" className="plans-page plans-page-narrow">
    <div className="plans-topbar"><Brand /><Link href="/pricing" className="btn-secondary">كل الباقات</Link></div>
    <section className="confirm-card">
      <p className="eyebrow">{quote.trial_available ? "تأكيد بدء التجربة المجانية" : "تفاصيل الباقة"}</p>
      <h1>باقة {plans[plan].name}</h1>
      <div className="confirm-price"><strong>{riyals(quote.net_halalas)}</strong><span>ريال / شهر بعد التجربة</span></div>
      <dl className="confirm-facts">
        {quote.trial_available && <><dt>مدة التجربة</dt><dd>{quote.trial_days} يومًا مجانًا، بدون بطاقة · تنتهي في {riyadhDate(trialEnd)}</dd></>}
        <dt>مزايا التجربة</dt><dd>كل مزايا باقة الأعمال طوال التجربة. مزايا {plans[plan].name} تبدأ عند تفعيل اشتراكك المدفوع بعدها.</dd>
        <dt>حدود {plans[plan].name}</dt><dd>{limitLabel(quote.limits).join(" · ")}</dd>
        <dt>الضريبة</dt><dd>{tax}</dd>
        <dt>الإجمالي الشهري</dt><dd>{quote.total_halalas === null ? "يُعرض بعد ضبط الضريبة، قبل أي خصم" : `${sar(quote.total_halalas)} ريال`}</dd>
      </dl>
      <ul className="plan-features">{plans[plan].features.map(f => <li key={f}><Check size={15} aria-hidden="true" />{f}</li>)}</ul>
      {quote.trial_available
        ? <form action={startTrialAction}><input type="hidden" name="plan" value={plan} /><button className="btn w-full">ابدأ {quote.trial_days} يومًا مجانًا الآن</button></form>
        : state && (state.status === "trialing" || state.status === "active")
          ? <Link href="/subscription" className="btn w-full">إدارة اشتراكي الحالي</Link>
          : <p role="status" className="plan-note">{quote.trial_used ? "استخدمت تجربتك المجانية من قبل." : "عرض التجربة المجانية غير متاح حاليًا."} تفعيل الدفع للاشتراكات المدفوعة قيد التحقق لدى مزود الدفع؛ لم يبدأ أي اشتراك أو تجديد تلقائي.</p>}
      <p className="plans-note">لا خصم ولا بطاقة خلال التجربة. بعد انتهائها تعود الصلاحيات إلى الباقة المجانية إلى أن تفعّل اشتراكك، وتبقى بياناتك محفوظة.</p>
    </section>
  </main>;
}
