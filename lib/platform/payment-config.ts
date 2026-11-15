import "server-only";
import { createPaylinkClient, normalizeBaseUrl, PAYLINK_HOSTS } from "@/lib/paylink/client";
import { billingCall } from "./billing-store";

export function paymentsEnabled() { return process.env.PAYMENTS_ENABLED === "true"; }
export function platformMerchant() {
  const sandbox = process.env.PAYLINK_SANDBOX !== "false";
  const selected = sandbox ? "SANDBOX" : "LIVE";
  const expected = `https://${sandbox ? PAYLINK_HOSTS.test : PAYLINK_HOSTS.live}`;
  const baseUrl = normalizeBaseUrl(process.env.PAYLINK_BASE_URL || expected);
  if (!baseUrl) return null;
  const loopback = process.env.NODE_ENV !== "production" && new URL(baseUrl).protocol === "http:";
  if (!loopback && baseUrl !== expected) return null;
  const apiId = process.env[`PAYLINK_${selected}_API_ID`] || (baseUrl === expected || loopback ? process.env.PAYLINK_API_ID : undefined);
  const secretKey = process.env[`PAYLINK_${selected}_SECRET_KEY`] || (baseUrl === expected || loopback ? process.env.PAYLINK_SECRET_KEY : undefined);
  return apiId && secretKey && process.env.PAYLINK_WEBHOOK_SECRET ? createPaylinkClient({ baseUrl, apiId, secretKey }) : null;
}
export type PaymentReadiness = { ready: boolean; enabled: boolean; verified: boolean; taxReady: boolean; blocked: "PROVIDER_NOT_READY" | "TAX_NOT_CONFIGURED" | null };
export async function paymentReadiness(): Promise<PaymentReadiness> {
  const config = await billingCall<{ verified: boolean; tax_ready: boolean }>("ec_billing_config");
  const enabled = paymentsEnabled(), merchant = platformMerchant();
  const blocked = !enabled || !merchant || !config.verified ? "PROVIDER_NOT_READY" : !config.tax_ready ? "TAX_NOT_CONFIGURED" : null;
  return { ready: blocked === null, enabled, verified: config.verified && Boolean(merchant), taxReady: config.tax_ready, blocked };
}
