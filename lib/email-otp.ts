// Matches EasyCoach's live Supabase Auth configuration (changed 2026-11-14):
// mailer_otp_length=6, smtp_max_frequency=60. Keep these aligned when changing Auth.
export const EMAIL_OTP_LENGTH = 6;
export const EMAIL_RESEND_SECONDS = 60;
export const SIGNUP_PENDING_SECONDS = 86400;

export function normalizeEmailOtp(value: string) {
  return value.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0)).replace(/\s/g, "");
}

export function validEmailOtp(value: string) {
  return new RegExp(`^[0-9]{${EMAIL_OTP_LENGTH}}$`).test(value);
}

export function signupDestination(role: string | undefined, next: string) {
  // next is always passed through safeNext on the server before this function.
  return next.startsWith("/invite/") ? next : role === "coach" ? next : "/me";
}
