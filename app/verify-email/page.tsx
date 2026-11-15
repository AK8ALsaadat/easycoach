import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SignupVerification } from "@/components/signup-verification";
import { readPendingSignup } from "@/lib/pending-signup";
import { actor, safeNext, snapshot } from "@/lib/server";
import { signupDestination } from "@/lib/email-otp";
import { LegalLinks } from "@/components/legal-links";
import { signOutForSignupVerification } from "@/app/signup-verification-actions";

export const metadata: Metadata = { title: "تأكيد بريدك | إيزي كوتش", robots: { index: false, follow: false } };
export default async function VerifyEmailPage() {
  const pending = await readPendingSignup();
  const signedIn = await actor();
  const differentAccount = signedIn && pending && signedIn.email.toLowerCase() !== pending.email.toLowerCase();
  if (signedIn && !differentAccount) {
    const data = await snapshot();
    redirect(signupDestination(data.profile?.role, safeNext(pending?.next)));
  }
  if (!pending) redirect("/login?register=1");
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col px-5 py-8 sm:py-12" dir="rtl">
    <Brand />
    {differentAccount ? <section className="card my-auto space-y-5 p-6 sm:p-8">
      <h1 className="text-2xl font-bold">تأكيد الحساب الجديد</h1>
      <p>أرسلنا رمز التحقق إلى البريد التالي:</p>
      <p className="break-all rounded-xl border bg-canvas px-4 py-3 text-center font-semibold"><bdi dir="ltr">{pending.email}</bdi></p>
      <p className="text-sm text-muted">أنت مسجّل دخول حاليًا بحساب <bdi className="break-all">{signedIn.email}</bdi>. سجّل الخروج منه لإدخال رمز الحساب الجديد. سيتغير الحساب المستخدم في تبويبات المنصة المفتوحة.</p>
      <form action={signOutForSignupVerification}>
        <button type="submit" className="btn w-full justify-center">تسجيل الخروج وإكمال التحقق</button>
      </form>
    </section> : <SignupVerification email={pending.email} resendAt={pending.resendAt} />}
    <p className="mt-6 text-center text-xs text-muted">حسابك وبياناتك محميّة إلى أن يكتمل تأكيد بريدك.</p>
    <LegalLinks className="mt-6 justify-center" />
  </main>;
}
