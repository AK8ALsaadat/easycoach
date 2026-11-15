import { timingSafeEqual } from "node:crypto";
import { PAYLINK_HOSTS, normalizeBaseUrl } from "@/lib/paylink/client";
import { paylinkVerified, paymentReadiness, paymentsEnabled, vatRegisteredEnv } from "@/lib/platform/payment-config";

export const dynamic = "force-dynamic";
const present = (name: string) => Boolean(process.env[name]?.trim());

/**
 * Operator smoke check. Booleans only: never values, hosts, IDs or secrets.
 * Requires `Authorization: Bearer <CRON_SECRET>`; anything else gets a bare 404.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const a = Buffer.from(supplied), b = Buffer.from(secret ?? "");
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

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
