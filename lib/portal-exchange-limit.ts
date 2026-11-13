import "server-only";
import { isIP } from "node:net";
import { hash, localGuard, localMode } from "./server";
import { getLocalDatabase } from "./local-db";
import { adminSupportClient } from "./supabase/admin";

export function portalExchangeRateKey(request: Request) {
  // Vercel overwrites this header at its trusted edge. Never trust arbitrary
  // forwarded headers on an unconfigured/self-hosted deployment.
  // https://vercel.com/docs/headers/request-headers#x-forwarded-for
  const forwarded = process.env.VERCEL === "1" ? request.headers.get("x-forwarded-for")?.trim() : null;
  const address = forwarded && isIP(forwarded) ? forwarded : "shared-untrusted-host";
  // Rotate the pseudonymous key daily; no raw IP or credential enters storage.
  return hash(`portal-exchange:${new Date().toISOString().slice(0, 10)}:${address}`);
}

export async function portalExchangeRetryAfter(request: Request): Promise<number> {
  const key = portalExchangeRateKey(request);
  if (localMode()) {
    await localGuard();
    const result = await (await getLocalDatabase()).query<{ retry: number }>(
      "select public.portal_exchange_rate_limit($1::text) as retry", [key],
    );
    return result.rows[0].retry;
  }
  const result = await adminSupportClient().rpc("portal_exchange_rate_limit", { key_hash: key });
  if (result.error) throw result.error;
  if (!Number.isInteger(result.data) || result.data < 0 || result.data > 900)
    throw Error("Invalid rate limit response");
  return result.data;
}
