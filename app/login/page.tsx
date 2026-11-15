import { cookies } from "next/headers";
import { translator } from "@/lib/i18n";
import { LanguageSwitch } from "@/components/language-switch";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
import { actor, localMode, safeNext, snapshot } from "@/lib/server";
import { SignedInNotice } from "@/components/signed-in-notice";
import { ProductPreview } from "@/components/product-preview";
import { LegalLinks } from "@/components/legal-links";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; register?: string; switch?: string }>;
}) {
  const params = await searchParams;
  const tr = translator(
    (await cookies()).get("ec_language")?.value === "en" ? "en" : "ar",
  );
  // Signing in here while another account is already signed in replaces the
  // identity of every open tab silently. Ask first, unless the visitor said
  // explicitly that they want to switch accounts.
  const signedIn = params.switch === "1" ? null : await actor();
  if (signedIn) {
    const state = await snapshot();
    return (
      <SignedInNotice
        email={signedIn.email}
        name={state.profile?.name ?? signedIn.name}
        home={state.profile?.role === "coach" ? safeNext(params.next) : "/me"}
        next={params.next}
      />
    );
  }
  return (
    <main className="auth-page grid min-h-screen lg:grid-cols-2">
      <section className="auth-panel flex flex-col px-6 py-8 sm:px-16 lg:px-24">
        <div className="auth-topbar flex justify-between gap-3">
          <Brand />
          <div className="flex flex-wrap items-center gap-3"><Link className="auth-pricing-link" href="/pricing">الباقات</Link><LanguageSwitch /></div>
        </div>
        <div className="my-auto w-full max-w-md self-center py-14">
          {params.error ? (
            <p role="alert" className="mb-4 text-red-700">
              {params.error === "oauth"
                ? tr("ما اكتمل الدخول بحساب Google. حاول مرة ثانية أو استخدم الإيميل.")
                : tr("تعذر تأكيد الحساب. جرّب رابطًا جديدًا أو سجّل الدخول.")}
            </p>
          ) : null}
          <AuthForm next={safeNext(params.next)} local={localMode()} initialRegister={params.register === "1"} google={!localMode() && process.env.AUTH_GOOGLE_ENABLED === "true"} />
        </div>
        <LegalLinks />
      </section>
      <aside className="auth-aside hidden lg:flex">
        <div className="auth-aside-glow" aria-hidden="true" />
        <p className="auth-aside-eyebrow">
          {tr("إدارة احترافية. تجربة تدريب أفضل.")}
        </p>
        <h2 className="auth-aside-title">
          {tr("كل جولة محسوبة.")}
          <br />
          <span className="auth-aside-accent">{tr("وكل متدرب له خطته.")}</span>
        </h2>
        <ProductPreview compact/>
        <p className="auth-aside-note">
          {tr("ويب عربي · توقيت الرياض · خصوصية من البداية")}
        </p>
      </aside>
    </main>
  );
}
