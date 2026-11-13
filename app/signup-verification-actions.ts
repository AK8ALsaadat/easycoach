"use server";
import { redirect } from "next/navigation";
import { actor, localMode, safeNext, snapshot, supabase } from "@/lib/server";
import { clearPendingSignup, readPendingSignup, writePendingSignup } from "@/lib/pending-signup";
import { EMAIL_OTP_LENGTH, EMAIL_RESEND_SECONDS, normalizeEmailOtp, signupDestination, validEmailOtp } from "@/lib/email-otp";

export type VerificationResult = { ok: boolean; message: string; url?: string; retryAt?: number };

export async function verifySignupCode(form: FormData): Promise<VerificationResult> {
  try {
    if (localMode()) return { ok: false, message: "التحقق بالبريد متاح مع Supabase فقط." };
    const pending = await readPendingSignup();
    if (!pending) return { ok: false, message: "ابدأ التسجيل من جديد لتحديد البريد الذي تريد تأكيده." };
    const code = normalizeEmailOtp(String(form.get("code") ?? ""));
    if (!validEmailOtp(code)) return { ok: false, message: `أدخل رمز التحقق المكوّن من ${EMAIL_OTP_LENGTH} أرقام.` };
    const client = await supabase();
    const { data, error } = await client.auth.verifyOtp({ email: pending.email, token: code, type: "email" });
    if (error) return { ok: false, message: error.status === 429 ? "محاولات تحقق كثيرة. انتظر قليلًا ثم حاول مرة أخرى." : "الرمز غير صحيح أو انتهت صلاحيته. تحقق منه أو اطلب رمزًا جديدًا." };
    if (!data.session || !data.user?.email_confirmed_at || data.user.email?.toLowerCase() !== pending.email)
      return { ok: false, message: "لم يكتمل تأكيد البريد. حاول مرة أخرى." };
    // Uses getUser on the server; no admin confirmation, and the SSR client has
    // already persisted the session through its HttpOnly cookie adapter.
    const user = await actor();
    if (!user || user.email.toLowerCase() !== pending.email) return { ok: false, message: "تعذر تثبيت الجلسة. أعد المحاولة أو سجّل الدخول بعد تأكيد البريد." };
    const state = await snapshot(); // init_profile is idempotent and requires verified Auth.
    const url = signupDestination(state.profile?.role, safeNext(pending.next));
    await clearPendingSignup();
    return { ok: true, message: "تم تأكيد بريدك بنجاح. ننقلك إلى حسابك…", url };
  } catch {
    return { ok: false, message: "تعذر الاتصال أو إكمال التحقق. حاول مرة أخرى؛ ويمكنك تسجيل الدخول إن كان البريد قد تأكد." };
  }
}

export async function resendSignupCode(): Promise<VerificationResult> {
  try {
    if (localMode()) return { ok: false, message: "التحقق بالبريد متاح مع Supabase فقط." };
    const pending = await readPendingSignup();
    if (!pending) return { ok: false, message: "ابدأ التسجيل من جديد لتحديد البريد الذي تريد تأكيده." };
    if (pending.resendAt > Date.now()) return { ok: false, message: "انتظر انتهاء العداد قبل طلب رمز جديد.", retryAt: pending.resendAt };
    const { error } = await (await supabase()).auth.resend({ type: "signup", email: pending.email });
    if (error) {
      if (error.status === 429) {
        const retryAt = Date.now() + EMAIL_RESEND_SECONDS * 1000;
        await writePendingSignup({ ...pending, resendAt: retryAt });
        return { ok: false, message: "وصلت إلى حد الإرسال. انتظر قليلًا؛ وقد يلزم وقت أطول إذا بلغ المشروع حده العام.", retryAt };
      }
      return { ok: false, message: "تعذر إرسال الرمز الآن. حاول مرة أخرى بعد قليل." };
    }
    const retryAt = Date.now() + EMAIL_RESEND_SECONDS * 1000;
    await writePendingSignup({ ...pending, resendAt: retryAt });
    return { ok: true, message: "تم قبول طلب إعادة الإرسال. تحقق من البريد الوارد والرسائل غير المرغوب فيها.", retryAt };
  } catch { return { ok: false, message: "تعذر الاتصال. لم نتأكد من إرسال الرمز؛ حاول مرة أخرى بعد قليل." }; }
}

export async function correctSignupEmail() {
  const next = safeNext((await readPendingSignup())?.next);
  await clearPendingSignup();
  redirect(`/login?register=1${next === "/coach" ? "" : `&next=${encodeURIComponent(next)}`}`);
}
