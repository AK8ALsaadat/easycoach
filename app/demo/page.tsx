import { cookies } from "next/headers";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { LanguageSwitch } from "@/components/language-switch";
import { DemoForm } from "@/components/demo-form";
import { translator } from "@/lib/i18n";
export default async function DemoPage() {
  const t = translator(
    (await cookies()).get("ec_language")?.value === "en" ? "en" : "ar",
  );
  return (
    <main className="mx-auto max-w-lg px-5 py-8">
      <div className="flex items-center justify-between gap-3">
        <Brand />
        <LanguageSwitch />
      </div>
      <section className="card mt-10 p-6 sm:p-8">
        <span className="badge">{t("تجربة المنصة")}</span>
        <h1 className="mt-4">{t("حساب تجريبي للـAI والاختبار")}</h1>
        <p className="text-muted leading-8 my-5">
          {t(
            "حساب عام ببيانات وهمية معزولة. يمكنك اختبار وظائف المنصة؛ لا تضع فيه بيانات عملاء حقيقية.",
          )}
        </p>
        <DemoForm />
        <Link className="btn-secondary mt-5" href="/login">
          {t("الدخول بحسابك الخاص")}
        </Link>
      </section>
    </main>
  );
}
