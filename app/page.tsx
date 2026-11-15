import { billingEnabled, FREE_PLATFORM_NOTICE } from "@/lib/billing-mode";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Dumbbell, Layers3, ShieldCheck, Sparkles, Users, Workflow } from "lucide-react";
import { actor } from "@/lib/server";
import { platformQuote } from "@/lib/platform/server";
import { Brand } from "@/components/brand";
import { ProductPreview } from "@/components/product-preview";
import { ThemeToggle } from "@/components/theme-toggle";
import { LegalLinks } from "@/components/legal-links";

export default async function Home() {
  if (await actor()) redirect("/coach");
  const offer = billingEnabled() ? await platformQuote("pro").catch(()=>null) : null;
  const trial = Boolean(offer?.trial_campaign_active);
  return <main className="marketing-page" dir="rtl">
    <nav className="public-nav"><Brand/><div className="public-nav-links"><Link href="#features">لماذا إيزي كوتش؟</Link>{billingEnabled() && <Link href="/pricing">الباقات</Link>}</div><div className="public-nav-actions"><ThemeToggle/><Link className="text-link" href="/login">دخول</Link><Link className="btn" href="/login?register=1">ابدأ الآن <ArrowLeft size={16}/></Link></div></nav>
    <section className="marketing-hero">
      <div className="marketing-hero-copy">
        <span className="hero-kicker"><Sparkles size={16}/>{!billingEnabled() ? FREE_PLATFORM_NOTICE : trial?"14 يومًا مجانًا. كل المساحة لك.":"مساحة واحدة لكل شغلك"}</span>
        <h1>وقتك للتدريب.<br/><span>والباقي علينا.</span></h1>
        <p>متدربوك، برامجهم، وجباتهم وتقدّمهم. رتّب كل التفاصيل في مساحة عربية واحدة، وركّز على الفرق الذي تصنعه.</p>
        <div className="hero-actions"><Link className="btn" href="/login?register=1">{trial?"ابدأ تجربتك مجانًا":"أنشئ مساحتك"}<ArrowLeft size={20}/></Link>{billingEnabled() && <Link className="text-link" href="/pricing">استكشف الباقات <ArrowLeft size={16}/></Link>}</div>
        <ul className="hero-assurances">{[trial?"14 يومًا بكل مزايا الأعمال":"مساحة عربية متكاملة",billingEnabled()?"بدون بطاقة بنكية":"كل أدواتك في مكان واحد","بياناتك تحت سيطرتك"].map(line=><li key={line}><Check size={15}/>{line}</li>)}</ul>
      </div>
      <div className="marketing-visual"><div className="visual-orbit" aria-hidden="true"/><span className="visual-floating-tag"><ShieldCheck size={17}/>كل متدرب. اهتمامه الخاص.</span><ProductPreview/><span className="visual-bottom-tag"><span className="live-dot"/>من أول برنامج إلى آخر إنجاز</span></div>
    </section>
    <div className="marketing-ribbon"><span>مصممة لطريقة شغلك</span><strong><Users size={19}/>إدارة المتدربين</strong><strong><Dumbbell size={19}/>برامج التدريب</strong><strong><Layers3 size={19}/>قوالبك الخاصة</strong><strong><Workflow size={19}/>متابعة مستمرة</strong></div>
    <section id="features" className="marketing-features">
      <header><p className="eyebrow">تفاصيل أقل. أثر أكبر.</p><h2>كل الأدوات التي تحتاجها.<br/>بدون التنقل بين عشر منصات.</h2></header>
      <div className="feature-bento">
        <article className="feature-card feature-card-large"><span className="feature-icon"><Users size={25}/></span><h3>اعرف متدربك.<br/>أكثر من مجرد اسم.</h3><p>ملفه، قياساته، هدفه وآخر تحديثاته أمامك. متابعة شخصية حتى مع نمو فريقك.</p><div className="feature-mini-tags"><span>الهدف</span><span>القياسات</span><span>الالتزام</span><span>التقدّم</span></div></article>
        <article className="feature-card"><span className="feature-icon"><Dumbbell size={25}/></span><h3>خطط بطريقتك.</h3><p>مكتبة تمارين، قوالب قابلة للتخصيص، وبرامج تكتب تفاصيلها بنفسك.</p><Link className="text-link" href="/login?register=1">جهّز أول برنامج <ArrowLeft size={16}/></Link></article>
        <article className="feature-card"><span className="feature-icon"><Workflow size={25}/></span><h3>مساحتك ومكانه.</h3><p>أرسل رابط بوابته. يشاهد برنامجه من جواله، وأنت تتابع تحديثاته من مساحتك.</p><Link className="text-link" href="/login?register=1">ابدأ المتابعة <ArrowLeft size={16}/></Link></article>
      </div>
    </section>
    <section className="marketing-final"><Sparkles size={28}/><h2>خطوتك القادمة،<br/>تبدأ من هنا.</h2><p>{trial?"سجّل، أكّد بريدك، وافتح مساحتك. تبدأ تجربتك مباشرة بدون بطاقة أو جوال.":"افتح مساحة تجمع شغلك وتترك لك وقتًا للتدريب."}</p><Link className="btn" href="/login?register=1">{trial?"ابدأ 14 يومًا مجانًا":"إنشاء حساب"}<ArrowLeft size={18}/></Link></section>
    <footer className="marketing-footer"><Brand/><LegalLinks/><span>صُنعت لتكون أقرب لطريقة تدريبك.</span></footer>
  </main>;
}
