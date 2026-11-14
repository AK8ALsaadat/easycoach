import Link from "next/link";
import { Brand } from "@/components/brand";
import { PlanCards, TrialHero } from "@/components/plan-cards";
import { planCodes } from "@/lib/platform/plans";
import { platformQuote, platformState } from "@/lib/platform/server";
import { actor } from "@/lib/server";

export const dynamic = "force-dynamic";
export default async function PricingPage() {
  const user = await actor();
  const [quotes, state] = await Promise.all([
    Promise.all(planCodes.map(code => platformQuote(code).catch(() => null))),
    user ? platformState().catch(() => null) : Promise.resolve(null),
  ]);
  return <main dir="rtl" className="plans-page">
    <div className="plans-topbar"><Brand /><Link href={user ? "/coach" : "/login"} className="btn-secondary">{user ? "مساحة المدرب" : "تسجيل الدخول"}</Link></div>
    <TrialHero quotes={quotes} />
    <PlanCards quotes={quotes} state={state} signedIn={Boolean(user)} context="pricing" />
    <section className="plans-faq" aria-label="أسئلة شائعة">
      <div><h3>هل أحتاج بطاقة للتجربة؟</h3><p>لا. تبدأ التجربة فور اختيار الباقة، ولا نطلب وسيلة دفع ولا نخصم شيئًا.</p></div>
      <div><h3>ماذا يحدث بعد انتهاء التجربة؟</h3><p>تعود صلاحياتك إلى الباقة المجانية إلى أن تفعّل اشتراكك، وتبقى بياناتك ومتدربوك محفوظين كما هم.</p></div>
      <div><h3>هل الاشتراك مرتبط بما أحصّله من متدربيّ؟</h3><p>لا. اشتراك EasyCoach مستقل تمامًا عن باقات الحصص التي تبيعها للمتدربين ودفعاتهم.</p></div>
    </section>
    <p className="plans-note">يُعرض الخصم فقط أثناء حملة معتمدة ومحددة المواعيد، وتظهر المعالجة الضريبية والإجمالي قبل أي تأكيد. تفعيل الدفع والتجديد الآلي للاشتراكات المدفوعة قيد التحقق لدى مزود الدفع.</p>
  </main>;
}
