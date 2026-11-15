import "server-only";
import { createPaylinkClient, normalizeBaseUrl, PAYLINK_HOSTS } from "@/lib/paylink/client";
import { billingCall } from "./billing-store";

export function paymentsEnabled() { return process.env.PAYMENTS_ENABLED === "true"; }
export function paylinkVerified() { return process.env.PAYLINK_VERIFIED === "true"; }
export function platformMerchant() {
  const sandbox = process.env.PAYLINK_SANDBOX !== "false";
  const selected = sandbox ? "SANDBOX" : "LIVE";
  const expected = `https://${sandbox ? PAYLINK_HOSTS.test : PAYLINK_HOSTS.live}`;
  const baseUrl = normalizeBaseUrl(process.env.PAYLINK_BASE_URL || expected);
  if (!baseUrl) return null;
  const loopback = process.env.NODE_ENV !== "production" && new URL(baseUrl).protocol === "http:";
  if (!loopback && baseUrl !== expected) return null;
  const apiId = process.env[`PAYLINK_${selected}_API_ID`] || (baseUrl === expected || loopback ? process.env.PAYLINK_API_ID : undefined);
  const secretKey = process.env[`PAYLINK_${selected}_API_SECRET`] || process.env[`PAYLINK_${selected}_SECRET_KEY`] || (baseUrl === expected || loopback ? process.env.PAYLINK_API_SECRET || process.env.PAYLINK_SECRET_KEY : undefined);
  return apiId && secretKey && process.env.PAYLINK_WEBHOOK_SECRET ? createPaylinkClient({ baseUrl, apiId, secretKey }) : null;
}
/** VAT_REGISTERED is tri-state: "false" (operator not registered), "true", or unset. Anything else is unset. */
export function vatRegisteredEnv(): boolean | null {
  const value = process.env.VAT_REGISTERED?.trim().toLowerCase();
  return value === "false" ? false : value === "true" ? true : null;
}
export type TaxMode = "unconfigured" | "not_registered" | "inclusive" | "exclusive";
export type PaymentReadiness = { ready: boolean; enabled: boolean; verified: boolean; taxReady: boolean; reason?: "tax_missing" | "payments_disabled" | "paylink_unverified" | "credentials_missing" | null; blocked: "PROVIDER_NOT_READY" | "TAX_NOT_CONFIGURED" | null;
  /** Database tax mode after any environment sync. The database is authoritative on conflict. */
  taxMode?: TaxMode | null; providerApproved?: boolean; merchantConfigured?: boolean; taxEnvironmentConflict?: boolean; taxEnvironmentInvalid?: boolean };
export function paymentReadinessMessage(readiness: PaymentReadiness) {
  if (!readiness.taxReady) return "لم تُحدد إعدادات التسجيل الضريبي للمشغّل";
  if (!readiness.enabled) return "الدفع معطل حاليًا من إعدادات المنصة";
  if (readiness.reason === "credentials_missing") return "التفعيل معطل لحين إكمال إعداد وسيلة الدفع";
  if (!readiness.verified) return "التفعيل معطل لحين تأكيد جاهزية وسيلة الدفع";
  return "";
}
export async function paymentReadiness(): Promise<PaymentReadiness> {
  // Environment tax values only fill in an unconfigured database; they never override explicit
  // database settings. A failed sync (for example, before the migration) keeps payments blocked.
  let invalidTaxEnvironment = false;
  const vatRegistered = vatRegisteredEnv();
  if (vatRegistered === false) {
    if (process.env.VAT_NUMBER?.trim() || process.env.VAT_RATE?.trim()) invalidTaxEnvironment = true;
    else await billingCall("ec_billing_operator_not_registered").catch(() => { invalidTaxEnvironment = true; });
  } else if (process.env.VAT_NUMBER) {
    const rate = Number(process.env.VAT_RATE) * 100;
    if (!process.env.VAT_RATE?.trim() || !/^[0-9]{15}$/.test(process.env.VAT_NUMBER) || !Number.isSafeInteger(rate) || rate < 0 || rate > 10000) invalidTaxEnvironment = true;
    else await billingCall("ec_billing_operator_config", { registration_number: process.env.VAT_NUMBER, vat_basis_points: rate, approve_provider: false }).catch(() => { invalidTaxEnvironment = true; });
  }
  const config = await billingCall<{ verified: boolean; tax_ready: boolean; tax_mode?: TaxMode }>("ec_billing_config");
  const enabled = paymentsEnabled(), merchant = platformMerchant();
  const taxMode = config.tax_mode ?? null;
  const taxEnvironmentConflict = vatRegistered === false ? Boolean(taxMode && taxMode !== "not_registered") : vatRegistered === true ? taxMode === "not_registered" : false;
  const taxReady = config.tax_ready && !invalidTaxEnvironment;
  const verified = paylinkVerified() && config.verified && Boolean(merchant);
  const reason = !taxReady ? "tax_missing" : !enabled ? "payments_disabled" : !paylinkVerified() || !config.verified ? "paylink_unverified" : !merchant ? "credentials_missing" : null;
  const blocked = !taxReady ? "TAX_NOT_CONFIGURED" : reason ? "PROVIDER_NOT_READY" : null;
  return { ready: blocked === null, enabled, verified, taxReady, reason, blocked, taxMode, providerApproved: config.verified, merchantConfigured: Boolean(merchant), taxEnvironmentConflict, taxEnvironmentInvalid: invalidTaxEnvironment };
}
