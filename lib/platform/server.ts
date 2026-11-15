import "server-only";
import { rpc, requireCoachIdentity, actor } from "@/lib/server";
import type { PlatformState, PlatformQuote, PlanCode } from "./plans";
import { paymentReadiness } from "./payment-config";
import { billingCall } from "./billing-store";
import { normalizeSaudiMobile } from "@/lib/paylink/flow";
import { POLICY_VERSION } from "@/lib/legal";

export async function platformState() {
  await requireCoachIdentity();
  const user = await actor();
  const readiness = await paymentReadiness();
  const current = await rpc<PlatformState>("ec_subscription");
  const freeTrial = !current.period_end && current.trial_end && Date.parse(current.trial_end) > Date.parse(current.server_now);
  await billingCall("ec_billing_refresh", { owner: user!.id, blocked: freeTrial ? null : readiness.blocked });
  return rpc<PlatformState>("ec_subscription");
}
export async function platformQuote(plan: PlanCode) {
  const readiness = await paymentReadiness();
  const quote = await rpc<PlatformQuote>("ec_quote", { plan_code: plan }, true);
  return { ...quote, provider_ready: readiness.ready, ...(!readiness.taxReady ? { tax_mode: "unconfigured", vat_halalas: null, total_halalas: null } : {}) };
}
/** The owner's own card-less trial. SQL enforces the campaign window, one trial per account and paid plans only. */
export async function startPlatformTrial(plan: PlanCode, phone = "") {
  await requireCoachIdentity();
  const user = (await actor())!;
  const mobile = phone.trim() ? normalizeSaudiMobile(phone) : null;
  if (phone.trim() && !mobile) throw Error("mobile_required");
  await billingCall("ec_billing_start", { owner: user.id, plan_code: plan, mobile, customer_name: user.name || user.email, accepted_version: POLICY_VERSION });
  return rpc<PlatformState>("ec_subscription");
}
export async function requireFeature(feature: string) {
  await requireCoachIdentity();
  await rpc("ec_require", { feature });
}
/** Hosted one-month platform checkout; this does not enable recurring card setup. */
export async function platformProviderReady() { return (await paymentReadiness()).ready; }

