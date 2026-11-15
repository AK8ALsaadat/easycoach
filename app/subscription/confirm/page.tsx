import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check } from "lucide-react";
import { Brand } from "@/components/brand";
import { isPlan, limitLabel, plans, riyadhDate, sar } from "@/lib/platform/plans";
import { platformQuote, platformState } from "@/lib/platform/server";
import { actor } from "@/lib/server";
import { LegalLinks } from "@/components/legal-links";
import { PlatformCheckout } from "@/components/platform-checkout";
import { platformProviderReady } from "@/lib/platform/server";
import { TrialStartForm } from "@/components/trial-start-form";

export const dynamic = "force-dynamic";
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ plan?: string; error?: string }> }) {
  const { plan = "pro", error } = await searchParams;
  if (!isPlan(plan) || plan === "free") notFound();
  const user = await actor();
  if (!user) redirect(`/login?register=1&next=${encodeURIComponent(`/start?plan=${plan}`)}`);
  const [quote, state] = await Promise.all([platformQuote(plan), platformState().catch(() => null)]);
  if (!state) redirect("/coach");
  const paymentReady = await platformProviderReady();
  const canPay = Boolean(state.lifecycle_enabled && !state.cancelled_at && (state.period_end ? Date.parse(state.period_end) <= Date.parse(state.server_now)+5*86400000 : state.trial_end && Date.parse(state.trial_end) <= Date.parse(state.server_now)));
  const trialEnd = new Date(Date.parse(quote.server_now) + quote.trial_days * 86_400_000).toISOString();
  const tax = quote.tax_mode === "unconfigured" ? "لم تُحدد إعدادات التسجيل الضريبي للمشغّل" : quote.tax_mode === "not_registered" ? "غير مسجل ضريبيًا بحسب إعدادات المشغّل" : `${sar(quote.vat_halalas ?? 0)} ريال (${quote.tax_mode === "inclusive" ? "مشمولة" : "تضاف للسعر"})`;
  return <main dir="rtl" className="plans-page plans-page-narrow">
    <div className="plans-topbar"><Brand /><Link href="/pricing" className="btn-secondary">كل الباقات</Link></div>
    <section className="confirm-card">
      <p className="eyebrow">{quote.trial_available ? "تأكيد بدء التجربة المجانية" : "تفاصيل الباقة"}</p>
      <h1>باقة {plans[plan].name}</h1>
      {error === "terms" && <p role="alert" className="plans-alert">وافق على الشروط وسياسة الخصوصية قبل بدء التجربة.</p>}
      {error === "start" && <p role="alert" className="plans-alert">تعذّر تأكيد بدء التجربة. راجع حالة الاشتراك الظاهرة هنا، ثم حاول مرة أخرى أو تواصل مع الدعم إذا استمرت المشكلة.</p>}
      <div className="confirm-price"><strong>{sar(quote.net_halalas)}</strong><span>ريال / 30 يومًا</span></div>
      <dl className="confirm-facts">
        {quote.trial_available && <><dt>المستحق اليوم</dt><dd><strong>0 ريال</strong> · لا خصم ولا حجز مبلغ</dd></>}
        {quote.trial_available && <><dt>مدة التجربة</dt><dd>{quote.trial_days} يومًا مجانًا، بدون بطاقة · تنتهي في {riyadhDate(trialEnd)}</dd></>}
        {quote.trial_available && <><dt>مزايا التجربة</dt><dd>كل مزايا باقة الأعمال طوال التجربة. مزايا {plans[plan].name} تبدأ عند تفعيل اشتراكك المدفوع بعدها.</dd></>}
        <dt>حدود {plans[plan].name}</dt><dd>{limitLabel(quote.limits).join(" · ")}</dd>
        <dt>الضريبة</dt><dd>{tax}</dd>
        <dt>الإجمالي الشهري</dt><dd>{quote.total_halalas === null ? "بانتظار ضبط الضريبة" : `${sar(quote.total_halalas)} ريال`}</dd>
      </dl>
      <ul className="plan-features">{plans[plan].features.map(f => <li key={f}><Check size={15} aria-hidden="true" />{f}</li>)}</ul>
      {quote.trial_available
        ? <TrialStartForm plan={plan} days={quote.trial_days} disabled={!paymentReady} />
        : state.mode === "legacy" || (!canPay && (state.status === "trialing" || state.status === "active"))
          ? <Link href="/subscription" className="btn w-full">إدارة اشتراكي الحالي</Link>
          : paymentReady && quote.total_halalas !== null
            ? <PlatformCheckout plan={plan} total={quote.total_halalas} />
            : <><button className="btn w-full" disabled>اشترك</button><p role="status" className="plans-alert">التفعيل معطل لحين تأكيد جاهزية وسيلة الدفع</p></>}
      <p className="plans-note">لا نحفظ بطاقة ولا نخصم تلقائيًا. بعد التجربة تصلك فاتورة دفع؛ تستمر المزايا خلال مهلة سماح 3 أيام. بياناتك تبقى محفوظة إذا توقفت الصلاحيات المدفوعة.</p>
      <section className="payment-availability" aria-labelledby="card-availability"><h2 id="card-availability">الدفع لكل فترة دون حفظ بطاقة</h2><p>Paylink يحصّل اشتراكك لصالح المنصة. كل فترة مدفوعة 30 يومًا من تاريخ الدفع؛ الدفع المبكر يبدأ فترة جديدة من تاريخ العملية. يظهر رابط التجديد قبل انتهاء الفترة بـ5 أيام، وتسدده بنفسك دون تفويض خصم تلقائي.</p></section>
    </section>
    <LegalLinks />
  </main>;
}
