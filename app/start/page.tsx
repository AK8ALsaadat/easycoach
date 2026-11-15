import { redirect as freeRedirect } from "next/navigation";
import { billingEnabled } from "@/lib/billing-mode";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, Check, ArrowLeft, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { isPaidPlan } from "@/lib/platform/plans";
import { platformQuote, platformState } from "@/lib/platform/server";
import { actor, snapshot } from "@/lib/server";
import { LegalLinks } from "@/components/legal-links";
import { TrialStartForm } from "@/components/trial-start-form";

export const metadata: Metadata = { title: "ابدأ تجربتك", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function StartPage({ searchParams }: { searchParams: Promise<{ plan?: string; error?: string }> }) {
  if (!billingEnabled()) freeRedirect("/");
  const search = await searchParams;
  const plan = isPaidPlan(search.plan) ? search.plan : "pro";
  if (!(await actor())) redirect(`/login?register=1&next=${encodeURIComponent(`/start?plan=${plan}`)}`);
  const data = await snapshot();
  if (data.profile?.role !== "coach") redirect("/me");
  const [state, quote] = await Promise.all([platformState().catch(() => null), platformQuote(plan).catch(() => null)]);
  if (state?.mode === "legacy" || state?.trial_used_at || state?.period_end) redirect("/coach");
  return <main className="onboarding-page" dir="rtl">
    <nav className="public-nav"><Brand /><Link href="/coach" className="text-link">المتابعة بالباقة المجانية <ArrowLeft size={16}/></Link></nav>
    <section className="onboarding-card">
      <span className="onboarding-symbol"><Sparkles size={32}/></span>
      <p className="eyebrow">مساحتك جاهزة يا {data.profile.name.split(" ")[0]}</p>
      <h1>ابدأ التدريب.<br/><span>واترك التنظيم علينا.</span></h1>
      <p className="onboarding-lead">14 يومًا تستكشف فيها كل مزايا الأعمال. خطوة واحدة، وتبدأ من الآن.</p>
      <ul className="onboarding-benefits">{["متدربوك وبرامجهم في مكان واحد", "مكتبة التمارين والقوالب والتقارير", "بدون بطاقة، بدون جوال، وبدون خصم تلقائي"].map(item=><li key={item}><Check size={18}/>{item}</li>)}</ul>
      {quote?.trial_available ? <TrialStartForm plan={plan} days={quote.trial_days}/> : <div className="space-y-4"><p role="status">{!state || !quote ? "تعذّر تحميل التجربة الآن. أعد المحاولة، أو تابع إلى مساحتك." : "عرض التجربة غير متاح حاليًا. مساحتك المجانية جاهزة."}</p><Link className="btn w-full" href={!state || !quote ? `/start?plan=${plan}` : "/coach"}>{!state || !quote ? "إعادة المحاولة" : "افتح مساحتك"}</Link></div>}
      {search.error && <p role="alert" className="plans-alert">{search.error === "terms" ? "وافق على الشروط والخصوصية لبدء تجربتك المجانية." : "لم تكتمل بداية التجربة. اضغط البدء للمحاولة مجددًا؛ لن تتكرر تجربة مفعّلة."}</p>}
      <p className="onboarding-footnote"><ShieldCheck size={16}/>بياناتك محفوظة. تختار باقتك وتقرر الدفع لاحقًا.</p>
    </section><LegalLinks className="justify-center"/>
  </main>;
}
