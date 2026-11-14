import Link from "next/link";
import { Brand } from "./brand";
import { LegalLinks } from "./legal-links";
import { POLICY_UPDATED_AR, POLICY_VERSION, type LegalSection } from "@/lib/legal";
export function LegalPage({ title, lead, sections }: { title: string; lead: string; sections: LegalSection[] }) {
  return <main className="legal-page" dir="rtl" lang="ar">
    <header className="plans-topbar"><Brand /><Link href="/pricing" className="btn-secondary">الباقات والأسعار</Link></header>
    <article className="legal-document"><header><p className="eyebrow">الحقوق والالتزامات بوضوح</p><h1>{title}</h1><p className="legal-lead">{lead}</p><p className="legal-updated">آخر تحديث: {POLICY_UPDATED_AR} · النسخة {POLICY_VERSION}</p></header>
      <nav className="legal-contents" aria-label="محتويات الصفحة">{sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav>
      {sections.map(section => <section key={section.id} id={section.id}><h2>{section.title}</h2>{section.paragraphs.map(text => <p key={text}>{text}</p>)}</section>)}
      <section className="legal-sources"><h2>مراجع رسمية</h2><p>تُقرأ هذه المعلومات مع الأنظمة واللوائح السارية ولا تتجاوز الحقوق النظامية للمستخدم.</p><a href="https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL" target="_blank" rel="noopener noreferrer">نظام حماية البيانات الشخصية — سدايا</a><a href="https://mc.gov.sa/ar/ecc/pages/default.aspx" target="_blank" rel="noopener noreferrer">نظام التجارة الإلكترونية — وزارة التجارة</a></section>
    </article><LegalLinks /><Link href="/" className="legal-back">العودة إلى مساحتك</Link>
  </main>;
}
