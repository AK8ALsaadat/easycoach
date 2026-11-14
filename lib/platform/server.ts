import "server-only";
import { rpc, requireCoachIdentity } from "@/lib/server";
import type { PlatformState, PlatformQuote, PlanCode } from "./plans";
import { POLICY_VERSION } from "@/lib/legal";

export async function platformState() {
  await requireCoachIdentity();
  return rpc<PlatformState>("ec_subscription");
}
export function platformQuote(plan: PlanCode) { return rpc<PlatformQuote>("ec_quote", { plan_code: plan }, true); }
/** The owner's own card-less trial. SQL enforces the campaign window, one trial per account and paid plans only. */
export async function startPlatformTrial(plan: PlanCode) {
  await requireCoachIdentity();
  return rpc<PlatformState>("ec_start_trial_accepted", { plan_code: plan, accepted_version: POLICY_VERSION });
}
export async function requireFeature(feature: string) {
  await requireCoachIdentity();
  await rpc("ec_require", { feature });
}
/** No documented zero-charge setup/delayed billing/cancellation adapter is available.
 * An environment flag alone must never enable an unverified payment journey. */
export function platformProviderReady() { return false; }

