import "server-only";
import { cookies } from "next/headers";
import { email } from "./model";
import { safeNext } from "./server";
import { EMAIL_RESEND_SECONDS, SIGNUP_PENDING_SECONDS } from "./email-otp";

const COOKIE = "ec_pending_signup";
export type PendingSignup = { email: string; next: string; resendAt: number; expiresAt: number };

/** Routing/email metadata only. This cookie is NOT an authenticated session. */
export async function writePendingSignup(pending: PendingSignup) {
  (await cookies()).set(COOKIE, JSON.stringify(pending), {
    httpOnly: true, sameSite: "lax", secure: process.env.APP_URL?.startsWith("https://") ?? false,
    path: "/", maxAge: SIGNUP_PENDING_SECONDS,
  });
}

export async function beginPendingSignup(contact: string, next: unknown) {
  const now = Date.now();
  await writePendingSignup({ email: email.parse(contact), next: safeNext(next), resendAt: now + EMAIL_RESEND_SECONDS * 1000, expiresAt: now + SIGNUP_PENDING_SECONDS * 1000 });
}

export async function readPendingSignup(): Promise<PendingSignup | null> {
  try {
    const raw = (await cookies()).get(COOKIE)?.value;
    if (!raw || raw.length > 1500) return null;
    const value = JSON.parse(raw);
    const contact = email.safeParse(value.email);
    if (!contact.success || typeof value.next !== "string" || !Number.isFinite(value.expiresAt) || !Number.isFinite(value.resendAt) || value.expiresAt <= Date.now()) return null;
    return { email: contact.data, next: safeNext(value.next), expiresAt: Math.min(value.expiresAt, Date.now() + SIGNUP_PENDING_SECONDS * 1000), resendAt: Math.min(value.resendAt, Date.now() + EMAIL_RESEND_SECONDS * 1000) };
  } catch { return null; }
}

export async function clearPendingSignup() {
  (await cookies()).delete(COOKIE);
}
