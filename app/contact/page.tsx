import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { LegalLinks } from "@/components/legal-links";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_ACTIVE } from "@/lib/legal";
export const metadata: Metadata = { title: "تواصل معنا" };
export default function Contact() {
  return <main className="legal-page" dir="rtl" lang="ar">
    <header className="plans-topbar"><Brand /><Link href="/pricing" className="btn-secondary">الباقات والأسعار</Link></header>
    <article className="legal-document"><header><p className="eyebrow">الدعم والمساعدة</p><h1>تواصل معنا</h1><p className="legal-lead">للاستفسارات وطلبات الخصوصية والمشكلات التي تواجهك.</p></header>
      <section><h2>الدعم داخل حسابك</h2><p>افتح زر «الدعم والاقتراحات» من مساحة المدرب لإرسال طلبك، أو استخدم أدوات طلب بياناتك من بوابة المتدرب للنسخ والتصحيح والحذف. عند تعذر الدخول، تحقق من بريد الحساب وجرّب رابط الدخول بالبريد.</p><div className="flex flex-wrap gap-3"><Link href="/coach" className="btn">فتح مساحة المدرب</Link><Link href="/me" className="btn-secondary">فتح بوابة المتدرب</Link></div></section>
      <section><h2>البريد المخصص للدعم والخصوصية</h2>{SUPPORT_EMAIL_ACTIVE ? <a className="legal-email" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> : <><p className="legal-email" dir="ltr">{SUPPORT_EMAIL}</p><p>البريد قيد التفعيل؛ استخدم قنوات الحساب المتاحة حاليًا ولا ترسل معلومات حساسة لهذا العنوان قبل تفعيله.</p></>}</section>
      <section><h2>ما الذي نحتاجه في الطلب؟</h2><p>اذكر نوع الطلب وبريد حسابك والخطوات التي جرّبتها ورقم العملية إن كان الطلب يخص دفعة. لا ترسل كلمة المرور أو رمز التحقق أو رقم البطاقة الكامل أو رمز الأمان.</p></section>
    </article><LegalLinks />
  </main>;
}
