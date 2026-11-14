import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { PlanCards, TrialHero, trialOffer } from "@/components/plan-cards";
import { isPaidPlan, planCodes, plans } from "@/lib/platform/plans";
import { platformQuote, platformState } from "@/lib/platform/server";
import { actor, snapshot } from "@/lib/server";

export const metadata: Metadata = { title: "اختر باقتك", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** First screen after a coach verifies their email: pick a plan and start the free trial. */
export default async function StartPage({ searchParams }: { searchParams: Promise<{ plan?: string; error?: string }> }) {
  const search = await searchParams;
  const plan = isPaidPlan(search.plan) ? search.plan : null;
  if (!(await actor())) redirect(`/login?register=1&next=${encodeURIComponent(plan ? `/start?plan=${plan}` : "/start")}`);
  const data = await snapshot();
  if (data.profile?.role !== "coach") redirect("/me");
  const [state, quotes] = await Promise.all([
    platformState().catch(() => null),
    Promise.all(planCodes.map(code => platformQuote(code).catch(() => null))),
  ]);
  // Nothing to choose: legacy accounts and running subscriptions go straight to work.
  if (!state || state.mode === "legacy" || state.status === "trialing" || state.status === "active") redirect("/coach");
  const offer = trialOffer(quotes);
  const firstName = data.profile.name.split(" ")[0];
  return <main dir="rtl" className="plans-page">
    <div className="plans-topbar"><Brand /><Link href="/coach" className="btn-secondary">تخطّي الآن</Link></div>
    <TrialHero quotes={quotes}
      title={offer.active ? `أهلًا ${firstName}، ابدأ بـ${offer.days} يومًا مجانًا` : `أهلًا ${firstName}، اختر باقتك`}
      lead={offer.active
        ? "حسابك جاهز. اختر الباقة التي تناسبك وجرّبها مجانًا بدون بطاقة؛ خلال التجربة تحصل على كل مزايا باقة الأعمال، وتبقى بياناتك محفوظة مهما قررت بعدها."
        : "حسابك جاهز. يمكنك البدء بالباقة المجانية الآن والترقية في أي وقت من صفحة الاشتراك."} />
    {search.error && <p role="alert" className="plans-alert">{search.error === "plan" ? "اختر باقة مدفوعة لبدء التجربة." : search.error}</p>}
    {plan && offer.active && <p className="plans-focus">اخترت باقة <strong>{plans[plan].name}</strong>؛ أكّد البدء من بطاقتها أو اختر باقة أخرى.</p>}
    <PlanCards quotes={quotes} state={state} signedIn highlight={plan} context="start" />
    <p className="plans-note">لا نطلب بطاقة ولا نخصم شيئًا خلال التجربة. عند انتهائها تعود صلاحياتك إلى الباقة المجانية إلى أن تفعّل اشتراكك، وتبقى سجلاتك ومتدربوك كما هم. التجربة مرة واحدة لكل حساب.</p>
  </main>;
}
