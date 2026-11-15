import { billingEnabled } from "@/lib/billing-mode";
import "server-only";
import { rpc, requireCoachIdentity } from "@/lib/server";
import { startPlatformTrial } from "./server";
import { isPaidPlan, type PlatformState } from "./plans";
import { signupDestination } from "@/lib/email-otp";

/** Only called after verified signup. SQL enforces ownership, eligibility and one trial. */
export async function completeSignupTrial(role: string | undefined, next: string, requested: boolean) {
  if (!billingEnabled()) return next.startsWith("/invite/") ? next : role === "coach" ? (next.startsWith("/coach") ? next : "/coach") : "/me";
  if (role !== "coach" || next.startsWith("/invite/") || !requested) return signupDestination(role, next);
  try {
    await requireCoachIdentity();
    const state = await rpc<PlatformState>("ec_subscription");
    if (state.mode !== "managed" || state.trial_used_at || state.period_end || state.cancelled_at) return "/coach";
    const selected = new URL(next, "https://easycoach.invalid").searchParams.get("plan");
    await startPlatformTrial(isPaidPlan(selected) ? selected : "pro");
  }
  catch {
    // A simultaneous verification may have completed the same one-time enrollment.
    const current = await rpc<PlatformState>("ec_subscription").catch(()=>null);
    if (!current?.trial_used_at) return "/start?error=trial";
  }
  return "/coach?trial=started";
}
