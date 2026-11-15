import "server-only";
import { localMode, localGuard } from "@/lib/server";
import { getLocalDatabase } from "@/lib/local-db";
import { adminSupportClient } from "@/lib/supabase/admin";

/** Only trusted server code can call lifecycle mutations. Never accept an RPC name from a request. */
export async function billingCall<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!/^ec_billing_[a-z_]+$/.test(name) || Object.keys(args).some(k => !/^[a-z_]+$/.test(k))) throw Error("Invalid billing operation");
  if (localMode()) {
    await localGuard();
    const entries = Object.entries(args);
    const result = await (await getLocalDatabase()).query<{ r: T }>(`select public.${name}(${entries.map(([key], i) => `${key}=>$${i+1}`).join(",")}) as r`, entries.map(([,v]) => v !== null && typeof v === "object" ? JSON.stringify(v) : v));
    return result.rows[0].r;
  }
  const { data, error } = await adminSupportClient().rpc(name, args);
  if (error) {
    const safe = /^(owner_required|terms_required|mobile_required|invalid_plan|provider_not_ready|tax_not_configured|trial_used|trial_unavailable|subscription_cancelled|period_running|quote_changed|pending_invoice|payment_review|rate_limited|coupon_invalid)$/.test(error.message) ? error.message : "billing_storage_unavailable";
    throw Error(safe);
  }
  return data as T;
}
