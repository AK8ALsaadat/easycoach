import "server-only";
import { rpc, requireCoachIdentity } from "@/lib/server";
import type { PlatformState, PlatformQuote, PlanCode } from "./plans";
import { platformMerchant } from "./paylink";
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
/** Hosted one-month platform checkout; this does not enable recurring card setup. */
export async function platformProviderReady() { return Boolean(platformMerchant()) && await rpc<boolean>("ec_paylink_ready"); }

