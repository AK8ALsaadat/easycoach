import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check } from "lucide-react";
import { Brand } from "@/components/brand";
import { canPayPlatform, isPlan, limitLabel, plans, riyadhDate, sar } from "@/lib/platform/plans";
import { platformQuote, platformState } from "@/lib/platform/server";
import { actor } from "@/lib/server";
import { LegalLinks } from "@/components/legal-links";
import { paymentReadiness } from "@/lib/platform/payment-config";
import { SubscriptionPurchaseOptions } from "@/components/subscription-purchase-options";

export const dynamic = "force-dynamic";
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ plan?: string; error?: string }> }) {
  const { plan = "pro", error } = await searchParams;
  if (!isPlan(plan) || plan === "free") notFound();
  const user = await actor();
  if (!user) redirect(`/login?register=1&next=${encodeURIComponent(`/start?plan=${plan}`)}`);
  const [quote, state] = await Promise.all([platformQuote(plan), platformState().catch(() => null)]);
  if (!state) redirect("/coach");
  const readiness = await paymentReadiness();
  const canPay = canPayPlatform(state);
  const trialRunning = Boolean(state.trial_end && Date.parse(state.trial_end) > Date.parse(state.server_now));
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
        {quote.tax_mode !== "not_registered" && <><dt>الضريبة</dt><dd>{tax}</dd></>}
        <dt>الإجمالي الشهري</dt><dd>{quote.total_halalas === null ? "بانتظار ضبط الضريبة" : `${sar(quote.total_halalas)} ريال`}</dd>
      </dl>
      <ul className="plan-features">{plans[plan].features.map(f => <li key={f}><Check size={15} aria-hidden="true" />{f}</li>)}</ul>
      {state.mode === "legacy" && <p className="rounded-2xl border border-current/10 p-4 text-sm">حسابك سابق ويملك كل المزايا حاليًا. بعد موافقتك وتأكيد الدفع تنتقل إلى الباقة المختارة وحدودها، وعند انتهاء الاشتراك تنطبق سياسة الباقة المجانية. فتح هذه الصفحة أو فشل الدفع لا يغيّر حسابك.</p>}
      <SubscriptionPurchaseOptions plan={plan} total={quote.total_halalas} trialAvailable={quote.trial_available} trialDays={quote.trial_days} canPay={canPay} renewal={Boolean(state.period_end)} transitionLegacy={state.mode === "legacy"} readiness={readiness} />
      {trialRunning && <p className="rounded-2xl border border-current/10 p-4 text-sm" role="status">{state.period_end ? `تم سداد الفترة القادمة. تبدأ في ${riyadhDate(state.period_start ?? state.trial_end!)} وتنتهي في ${riyadhDate(state.period_end)}.` : `يمكنك الدفع الآن. تبدأ الـ30 يومًا المدفوعة بعد نهاية تجربتك في ${riyadhDate(state.trial_end!)}، وتبقى مزايا التجربة حتى ذلك الموعد.`}</p>}
      <p className="plans-note">لا نحفظ بطاقة ولا نخصم تلقائيًا. يمكنك سداد الفترة أثناء التجربة؛ تبدأ بعد نهايتها. إذا لم تسدد، تستمر المزايا خلال مهلة سماح 3 أيام بعد التجربة. بياناتك تبقى محفوظة إذا توقفت الصلاحيات المدفوعة.</p>
      <section className="payment-availability" aria-labelledby="card-availability"><h2 id="card-availability">الدفع لكل فترة دون حفظ بطاقة</h2><p>Paylink يحصّل اشتراكك لصالح المنصة. الفترة المدفوعة 30 يومًا؛ عند السداد أثناء التجربة تبدأ بعد نهاية التجربة، وفي غير ذلك تبدأ من تاريخ الدفع المتحقق منه. يظهر رابط التجديد قبل انتهاء الفترة المدفوعة بـ5 أيام، وتسدده بنفسك دون تفويض خصم تلقائي.</p></section>
    </section>
    <LegalLinks />
  </main>;
}
