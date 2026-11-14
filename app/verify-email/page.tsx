import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SignupVerification } from "@/components/signup-verification";
import { readPendingSignup } from "@/lib/pending-signup";
import { actor, safeNext, snapshot } from "@/lib/server";
import { signupDestination } from "@/lib/email-otp";
import { LegalLinks } from "@/components/legal-links";

export const metadata: Metadata = { title: "تأكيد بريدك | إيزي كوتش", robots: { index: false, follow: false } };
export default async function VerifyEmailPage() {
  const pending = await readPendingSignup();
  if (await actor()) {
    const data = await snapshot();
    redirect(signupDestination(data.profile?.role, safeNext(pending?.next)));
  }
  if (!pending) redirect("/login?register=1");
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col px-5 py-8 sm:py-12" dir="rtl">
    <Brand />
    <SignupVerification email={pending.email} resendAt={pending.resendAt} />
    <p className="mt-6 text-center text-xs text-muted">حسابك وبياناتك محميّة إلى أن يكتمل تأكيد بريدك.</p>
    <LegalLinks className="mt-6 justify-center" />
  </main>;
}
