import { billingEnabled } from "@/lib/billing-mode";
import { timingSafeEqual } from "node:crypto";
import { PAYLINK_HOSTS, normalizeBaseUrl } from "@/lib/paylink/client";
import { paylinkVerified, paymentReadiness, paymentsEnabled, platformMerchant, vatRegisteredEnv } from "@/lib/platform/payment-config";

export const dynamic = "force-dynamic";
const present = (name: string) => Boolean(process.env[name]?.trim());

/**
 * Operator smoke check. Booleans only: never values, hosts, IDs or secrets.
 * Accepts a dedicated PAYMENT_HEALTH_SECRET or the existing CRON_SECRET.
 * Anything else gets a bare 404. POST additionally verifies merchant authentication.
 */
export async function GET(request: Request) {
  if (!billingEnabled()) return new Response(null, { status: 404 });
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const a = Buffer.from(supplied);
  const authorized = [process.env.PAYMENT_HEALTH_SECRET, process.env.CRON_SECRET].some(secret => {
    if (!secret) return false;
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!authorized) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  const sandboxSelected = process.env.PAYLINK_SANDBOX !== "false";
  const baseUrl = normalizeBaseUrl(process.env.PAYLINK_BASE_URL || `https://${sandboxSelected ? PAYLINK_HOSTS.test : PAYLINK_HOSTS.live}`);
  const readiness = await paymentReadiness().catch(() => null);
  const body = {
    paylink: {
      baseUrlIsProduction: baseUrl === `https://${PAYLINK_HOSTS.live}`,
      liveModeSelected: !sandboxSelected,
      apiIdPresent: present("PAYLINK_API_ID") || present(`PAYLINK_${sandboxSelected ? "SANDBOX" : "LIVE"}_API_ID`),
      apiSecretPresent: present("PAYLINK_API_SECRET") || present("PAYLINK_SECRET_KEY") || present(`PAYLINK_${sandboxSelected ? "SANDBOX" : "LIVE"}_API_SECRET`) || present(`PAYLINK_${sandboxSelected ? "SANDBOX" : "LIVE"}_SECRET_KEY`),
      webhookSecretPresent: present("PAYLINK_WEBHOOK_SECRET"),
      merchantConfigured: readiness?.merchantConfigured ?? false,
    },
    tax: {
      vatRegisteredFalse: vatRegisteredEnv() === false,
      vatNumberPresent: present("VAT_NUMBER"),
      vatRatePresent: present("VAT_RATE"),
      notRegistered: readiness?.taxMode === "not_registered",
      taxReady: readiness?.taxReady ?? false,
      environmentConflictDatabaseWins: readiness?.taxEnvironmentConflict ?? false,
      environmentInvalid: readiness?.taxEnvironmentInvalid ?? false,
    },
    gates: {
      paymentsEnabled: paymentsEnabled(),
      paylinkVerified: paylinkVerified(),
      databaseProviderApproved: readiness?.providerApproved ?? false,
    },
    appUrlHttps: (process.env.APP_URL ?? "").startsWith("https://"),
    databaseReachable: readiness !== null,
    readyToCharge: readiness?.ready ?? false,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!billingEnabled()) return new Response(null, { status: 404 });
  const response = await GET(request);
  if (response.status !== 200) return response;
  const body = await response.json();
  const merchant = platformMerchant();
  let authenticationSucceeded = false;
  if (merchant) {
    try { await merchant.auth({ fresh: true }); authenticationSucceeded = true; }
    catch { /* Only booleans are returned, never provider errors or tokens. */ }
  }
  return Response.json({ ...body, paylink: { ...body.paylink, authenticationChecked: Boolean(merchant), authenticationSucceeded } }, { headers: { "Cache-Control": "no-store" } });
}
