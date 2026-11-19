import { FREE_PLATFORM_NOTICE, billingEnabled } from "@/lib/billing-mode";
import { Check, Sparkles } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
import { LegalLinks } from "@/components/legal-links";
import { ProductPreview } from "@/components/product-preview";
import { SignedInNotice } from "@/components/signed-in-notice";
import { ThemeToggle } from "@/components/theme-toggle";
import { actor, localMode, snapshot } from "@/lib/server";
import type { Metadata } from "next";

// Campaign landing page: paid visitors arrive here instead of "/", which asks
// them to read the full marketing story before it offers the form. Keep it out
// of search results so it never competes with the homepage for the same terms.
export const metadata: Metadata = {
  title: "إيزي كوتش | ابدأ مساحتك",
  robots: { index: false, follow: false },
};

// What a visitor gets, in the order the ads promise it. The ad and this page
// have to say the same thing: a visitor who taps a macros video and lands on a
// generic welcome has to re-convince themselves before they reach the form.
const PROMISES = [
  "تمارين بالصور وقوالب جاهزة تعيد استخدامها",
  "ماكروز ووجبات محسوبة بدقائق، بدون إكسل",
  "اشتراكات وتجديدات بالأرقام مع تذكير التجديد",
];

export default async function Join() {
  // Same courtesy as /login: signing in over a live session would silently
  // replace the identity of every open tab.
  const signedIn = await actor();
  if (signedIn) {
    const state = await snapshot();
    return (
      <SignedInNotice
        email={signedIn.email}
        name={state.profile?.name ?? signedIn.name}
        home={state.profile?.role === "coach" ? "/coach" : "/me"}
      />
    );
  }
  return (
    <main className="auth-page grid min-h-screen lg:grid-cols-2" dir="rtl">
      <section className="auth-panel flex flex-col px-6 py-8 sm:px-16 lg:px-24">
        <div className="auth-topbar flex justify-between gap-3">
          <Brand />
          <ThemeToggle />
        </div>
        <div className="my-auto w-full max-w-md self-center py-10">
          {/* The pitch sits above the form so it is read on a phone, where the
              desktop aside is hidden. No heading element: AuthForm owns the h1. */}
          <p className="eyebrow">
            <Sparkles size={15} />
            {!billingEnabled() ? FREE_PLATFORM_NOTICE : "14 يومًا مجانًا · بدون بطاقة"}
          </p>
          <p className="mt-2 mb-5 text-[0.95rem] leading-relaxed">
            برنامج متدربك كامل — تمارينه ووجباته ومتابعة تقدّمه — يوصله برابط واحد.
          </p>
          <AuthForm
            next="/coach"
            local={localMode()}
            initialRegister
            google={!localMode() && process.env.AUTH_GOOGLE_ENABLED === "true"}
          />
          {/* Detail sits under the form: on a phone every line above the first
              field is a line between the ad and the only action on the page. */}
          <ul className="hero-assurances">
            {PROMISES.map(line => (
              <li key={line}>
                <Check size={15} />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <LegalLinks />
      </section>
      <aside className="auth-aside hidden lg:flex">
        <div className="auth-aside-glow" aria-hidden="true" />
        <p className="auth-aside-eyebrow">إدارة احترافية. تجربة تدريب أفضل.</p>
        <h2 className="auth-aside-title">
          كل جولة محسوبة.
          <br />
          <span className="auth-aside-accent">وكل متدرب له برنامجه.</span>
        </h2>
        <ProductPreview compact />
        <p className="auth-aside-note">ويب عربي · توقيت الرياض · خصوصية من البداية</p>
      </aside>
    </main>
  );
}
