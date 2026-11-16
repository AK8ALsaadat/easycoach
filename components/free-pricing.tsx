import Link from "next/link";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { Brand } from "./brand";
import { LegalLinks } from "./legal-links";

const features = [
  "إدارة المتدربين وملفاتهم في مكان واحد",
  "مكتبة 876 تمرينًا وبرامج تدريب مخصصة",
  "تنظيم التغذية والوجبات وأهداف السعرات",
  "متابعة الوزن والقياسات وصور التقدم",
  "بوابة خاصة لكل متدرب لعرض برنامجه ومتابعته",
  "الحضور ورصيد الحصص والفريق والتقارير",
];

export function FreePricing({ signupHref }: { signupHref: string }) {
  return (
    <main dir="rtl" lang="ar" className="free-pricing-page">
      <header className="free-pricing-topbar">
        <Brand />
        <span>مساحتك لإدارة التدريب</span>
      </header>
      <section className="free-pricing-layout" aria-labelledby="free-pricing-heading">
        <div className="free-pricing-copy">
          <p className="eyebrow">أسعار إيزي كوتش</p>
          <h1 id="free-pricing-heading">ركّز على متدربيك.<br />مساحتك علينا الآن.</h1>
          <p className="free-pricing-lead">كل أدواتك لإدارة التدريب والمتابعة في مساحة عربية واحدة. ابدأ بالخطة المجانية، بدون بطاقة دفع.</p>
          <p className="free-pricing-reassurance"><Check size={18} aria-hidden="true" />بدون بطاقة · بدون خصم تلقائي</p>
        </div>
        <article className="free-pricing-offer" aria-labelledby="free-plan-heading">
          <p className="free-pricing-badge"><Sparkles size={16} aria-hidden="true" />مجاناً لفترة محدودة</p>
          <h2 id="free-plan-heading">خطة إيزي كوتش المجانية</h2>
          <p className="free-pricing-amount"><strong>0</strong><span>ريال حاليًا</span></p>
          <p className="free-pricing-caption">أدواتك الأساسية، من أول متدرب إلى متابعة فريقك.</p>
          <Link href={signupHref} className="btn free-pricing-cta">ابدأ مجاناً<ArrowLeft size={19} aria-hidden="true" /></Link>
          <p className="free-pricing-note">أنشئ حسابك وأكّد بريدك لبدء استخدام مساحتك.</p>
          <ul className="free-pricing-features">
            {features.map(feature => <li key={feature}><Check size={18} aria-hidden="true" /><span>{feature}</span></li>)}
          </ul>
        </article>
      </section>
      <footer className="free-pricing-footer"><LegalLinks /></footer>
    </main>
  );
}
