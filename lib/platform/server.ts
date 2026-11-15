import "server-only";
import { rpc, requireCoachIdentity, actor } from "@/lib/server";
import type { PlatformState, PlatformQuote, PlanCode } from "./plans";
import { paymentReadiness, platformMerchant, paymentsEnabled } from "./payment-config";
import { billingCall } from "./billing-store";
import { normalizeSaudiMobile } from "@/lib/paylink/flow";
import { recordProviderIssue } from "./paylink";
import { POLICY_VERSION } from "@/lib/legal";

export async function platformState() {
  await requireCoachIdentity();
  const user = await actor();
  const readiness = await paymentReadiness();
  await billingCall("ec_billing_refresh", { owner: user!.id, blocked: readiness.blocked });
  return rpc<PlatformState>("ec_subscription");
}
export async function platformQuote(plan: PlanCode) {
  const quote = await rpc<PlatformQuote>("ec_quote", { plan_code: plan }, true);
  return { ...quote, provider_ready: quote.provider_ready && paymentsEnabled() && Boolean(platformMerchant()) };
}
/** The owner's own card-less trial. SQL enforces the campaign window, one trial per account and paid plans only. */
export async function startPlatformTrial(plan: PlanCode, phone: string) {
  await requireCoachIdentity();
  const user = (await actor())!;
  const ready = await paymentReadiness();
  if (!ready.ready) {
    await billingCall("ec_billing_refresh", { owner: user.id, blocked: ready.blocked });
    throw Error(ready.blocked === "TAX_NOT_CONFIGURED" ? "tax_not_configured" : "provider_not_ready");
  }
  const mobile = normalizeSaudiMobile(phone);
  if (!mobile) throw Error("mobile_required");
  try { await platformMerchant()!.auth(); }
  catch (error) { await recordProviderIssue(error, user.id); throw Error("provider_not_ready"); }
  await billingCall("ec_billing_start", { owner: user.id, plan_code: plan, mobile, customer_name: user.name || user.email, accepted_version: POLICY_VERSION });
  return rpc<PlatformState>("ec_subscription");
}
export async function requireFeature(feature: string) {
  await requireCoachIdentity();
  await rpc("ec_require", { feature });
}
/** Hosted one-month platform checkout; this does not enable recurring card setup. */
export async function platformProviderReady() { return (await paymentReadiness()).ready; }

