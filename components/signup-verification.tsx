"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck, ShieldCheck } from "lucide-react";
import { correctSignupEmail, resendSignupCode, verifySignupCode, type VerificationResult } from "@/app/signup-verification-actions";
import { EMAIL_OTP_LENGTH, normalizeEmailOtp, validEmailOtp } from "@/lib/email-otp";

export function SignupVerification({ email, resendAt }: { email: string; resendAt: number }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<"verify" | "resend" | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [retryAt, setRetryAt] = useState(resendAt);
  const [seconds, setSeconds] = useState<number | null>(null);
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update(); const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  async function run(kind: "verify" | "resend") {
    if (lock.current) return;
    lock.current = true; setPending(kind); setResult(null);
    try {
      const form = new FormData(); form.set("code", code);
      const response = kind === "verify" ? await verifySignupCode(form) : await resendSignupCode();
      setResult(response);
      if (kind === "resend" && response.ok) { setCode(""); input.current?.focus(); }
      if (response.retryAt) { setRetryAt(response.retryAt); setSeconds(Math.max(0, Math.ceil((response.retryAt - Date.now()) / 1000))); }
      if (response.ok && response.url) { setCode(""); router.replace(response.url); router.refresh(); }
      else if (kind === "verify" && !response.ok) { input.current?.focus(); input.current?.select(); }
    } catch { setResult({ ok: false, message: "تعذر الاتصال. بيانات البريد ما زالت هنا؛ حاول مرة أخرى." }); }
    finally { lock.current = false; setPending(null); }
  }
  return <section className="card my-auto space-y-6 p-6 sm:p-8" aria-labelledby="verify-email-title" aria-busy={pending !== null}>
    <div className="flex size-14 items-center justify-center rounded-2xl bg-canvas text-teal"><MailCheck size={28} aria-hidden="true" /></div>
    <div className="space-y-3"><p className="text-sm font-semibold text-teal">الخطوة الأخيرة لإنشاء حسابك</p><h1 id="verify-email-title">أكّد بريدك الإلكتروني</h1>
      <p className="text-sm text-muted">أرسلنا رمزًا إلى البريد التالي لإكمال التسجيل. أدخله هنا لفتح حسابك.</p>
      <p className="break-all rounded-xl border bg-canvas px-4 py-3 text-center font-semibold"><bdi dir="ltr">{email}</bdi></p>
    </div>
    <form method="post" className="space-y-4" onSubmit={event => { event.preventDefault(); if (validEmailOtp(code)) void run("verify"); }}>
      <label htmlFor="signup-otp" className="block font-semibold">رمز التحقق</label>
      <input ref={input} id="signup-otp" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" dir="ltr" className="field text-center text-2xl tracking-[0.25em]" required minLength={EMAIL_OTP_LENGTH} maxLength={EMAIL_OTP_LENGTH} pattern={`[0-9]{${EMAIL_OTP_LENGTH}}`} value={code} onChange={event => { setCode(normalizeEmailOtp(event.target.value)); setResult(null); }} onPaste={event => { event.preventDefault(); setCode(normalizeEmailOtp(event.clipboardData.getData("text"))); setResult(null); }} readOnly={pending !== null} aria-describedby="signup-otp-help" />
      <p id="signup-otp-help" className="text-xs text-muted">الرمز مكوّن من {EMAIL_OTP_LENGTH} أرقام. يمكنك لصقه كاملًا، بما في ذلك الأصفار في بدايته.</p>
      <button className="btn w-full justify-center" disabled={pending !== null || !validEmailOtp(code)}>{pending === "verify" ? "جارٍ التحقق…" : "تأكيد البريد وفتح الحساب"}<ShieldCheck size={18} aria-hidden="true" /></button>
    </form>
    {result && <p role={result.ok ? "status" : "alert"} className={`rounded-xl border p-3 text-sm ${result.ok ? "text-teal" : "text-danger"}`}>{result.message}</p>}
    <div className="space-y-3 border-t pt-5 text-center">
      <p className="text-sm text-muted">لم يصلك الرمز؟ تحقق من الرسائل غير المرغوب فيها.</p>
      <button type="button" className="btn-secondary w-full" disabled={pending !== null || seconds === null || seconds > 0} onClick={() => void run("resend")}>{pending === "resend" ? "جارٍ طلب الرمز…" : seconds !== null && seconds > 0 ? `إعادة الإرسال بعد ${seconds} ثانية` : "إعادة إرسال الرمز"}</button>
      <form action={correctSignupEmail}><button className="text-sm text-teal underline" disabled={pending !== null}>الرجوع لتصحيح البريد</button></form>
      <p className="text-xs text-muted">لتصحيح البريد، ابدأ التسجيل بالبريد الصحيح. تعديل البريد في تسجيل جديد لا يغيّر الحساب السابق تلقائيًا.</p>
    </div>
  </section>;
}
