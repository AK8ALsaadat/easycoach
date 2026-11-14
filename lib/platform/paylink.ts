import "server-only";
import { createPaylinkClient, normalizeBaseUrl } from "@/lib/paylink/client";
import { localGuard, localMode, rpc } from "@/lib/server";
import { getLocalDatabase } from "@/lib/local-db";
import { adminSupportClient } from "@/lib/supabase/admin";
import { POLICY_VERSION } from "@/lib/legal";
import { plans, type PaidPlan } from "./plans";
import type { VerifyResult } from "@/lib/paylink/flow";

/** One platform merchant, with no fallback to any coach's credentials. */
export function platformMerchant() {
  const baseUrl = normalizeBaseUrl(process.env.PAYLINK_BASE_URL);
  const apiId = process.env.PAYLINK_API_ID, secretKey = process.env.PAYLINK_SECRET_KEY;
  return baseUrl && apiId && secretKey && process.env.PAYLINK_WEBHOOK_SECRET ? createPaylinkClient({ baseUrl, apiId, secretKey }) : null;
}
async function trusted<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!/^ec_paylink_(attach|lookup|settle)$/.test(name)) throw Error("Invalid billing operation");
  if (localMode()) {
    await localGuard();
    const entries = Object.entries(args);
    const result = await (await getLocalDatabase()).query<{ result: T }>(`select public.${name}(${entries.map(([k], i) => `${k}=>$${i + 1}`).join(",")}) as result`, entries.map(([, v]) => v));
    return result.rows[0].result;
  }
  const { data, error } = await adminSupportClient().rpc(name, args);
  if (error) throw Error("Billing storage unavailable");
  return data as T;
}
type Invoice = { id: string; provider_order: string; transaction_ref: string | null; amount_halalas: number; status: string; owner_id: string; created?: boolean; payment_url?: string | null };

export async function verifyPlatformPayment(params: { transactionNo?: string | null; orderNumber?: string | null }): Promise<VerifyResult> {
  const { transactionNo, orderNumber } = params;
  if ((transactionNo && !/^[A-Za-z0-9-]{1,64}$/.test(transactionNo)) || (orderNumber && !/^ECP-[a-f0-9]{32}$/.test(orderNumber))) return { state: "unknown", errors: [] };
  if (!transactionNo && !orderNumber) return { state: "unknown", errors: [] };
  const stored = await trusted<Invoice | null>("ec_paylink_lookup", { transaction: transactionNo ?? null, order_no: orderNumber ?? null });
  if (!stored || (orderNumber && stored.provider_order !== orderNumber) || (stored.transaction_ref && transactionNo && stored.transaction_ref !== transactionNo)) return { state: "unknown", errors: [] };
  const merchant = platformMerchant();
  if (!merchant) return { state: "error", errors: [] };
  const transaction = stored.transaction_ref ?? transactionNo;
  if (!transaction) return { state: "pending", errors: [] };
  const remote = await merchant.getInvoice(transaction);
  if (remote.transactionNo !== transaction) return { state: "error", errors: [] };
  const halalas = Math.round(remote.amount * 100);
  if (!Number.isSafeInteger(halalas) || Math.abs(remote.amount * 100 - halalas) > 0.00001) return { state: "error", errors: [] };
  const state = await trusted<VerifyResult["state"]>("ec_paylink_settle", {
    invoice: stored.id, transaction, order_no: remote.orderNumber, amount: halalas,
    currency_code: remote.currency, provider_status: remote.orderStatus,
  });
  return { state, errors: remote.paymentErrors, ...(["paid", "review"].includes(state) ? { amount: remote.amount } : {}) };
}

export async function checkoutPlatform(input: { plan: PaidPlan; total: number; mobile: string; email: string; name: string }) {
  const merchant = platformMerchant();
  if (!merchant) throw Error("billing_unavailable");
  const app = new URL(process.env.APP_URL ?? "");
  if (process.env.NODE_ENV === "production" && app.protocol !== "https:") throw Error("billing_unavailable");
  // Authentication cannot create a charge. Reject bad credentials before
  // reserving an invoice that would otherwise need operator recovery.
  await merchant.auth();
  const invoice = await rpc<Invoice>("ec_paylink_reserve", { plan_code: input.plan, expected_total: input.total, accepted_version: POLICY_VERSION });
  if (!invoice.created) {
    if (invoice.transaction_ref) {
      const result = await verifyPlatformPayment({ transactionNo: invoice.transaction_ref });
      if (result.state === "paid" || result.state === "review") return `${app.origin}/subscription`;
      if (result.state === "canceled") throw Error("invoice_canceled");
      if (result.state === "pending" && invoice.payment_url) return invoice.payment_url;
    }
    // A lost create response is never retried: it may already exist at Paylink.
    throw Error("payment_pending");
  }
  const created = await merchant.createInvoice({
    orderNumber: invoice.provider_order, amount: invoice.amount_halalas / 100,
    clientName: input.name, clientEmail: input.email, clientMobile: input.mobile,
    callBackUrl: `${app.origin}/payments/paylink/callback?orderNumber=${invoice.provider_order}`,
    cancelUrl: `${app.origin}/payments/paylink/cancel?orderNumber=${invoice.provider_order}`,
    products: [{ title: `EasyCoach · ${plans[input.plan].name} · شهر واحد`, price: invoice.amount_halalas / 100, qty: 1 }],
  });
  await trusted("ec_paylink_attach", { invoice: invoice.id, transaction: created.transactionNo, url: created.url });
  return created.url;
}
