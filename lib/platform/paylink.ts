import "server-only";
import { PaylinkError } from "@/lib/paylink/client";
import type { VerifyResult } from "@/lib/paylink/flow";
import { billingCall } from "./billing-store";
import { paymentReadiness, platformMerchant, paymentsEnabled } from "./payment-config";
import { plans, type PaidPlan } from "./plans";
export { platformMerchant } from "./payment-config";

type Attempt = { id: string; invoice_id: string; owner_id: string; order_no: string; transaction_no: string | null; payment_url: string | null; amount_halalas: number; created?: boolean; plan: PaidPlan; mobile: string; customer_name: string };
export async function recordProviderIssue(error: unknown, owner?: string) {
  if (error instanceof PaylinkError && (error.code === "auth_failed" || error.status === 401 || error.status === 403)) {
    console.error("payments.provider_not_ready", { reason: "authentication_or_permission", action: "Check selected sandbox/live merchant credentials and API permissions, then verify the provider again. No keys are logged." });
    await billingCall("ec_billing_provider_issue").catch(() => {});
    if (owner) await billingCall("ec_billing_refresh", { owner, blocked: "PROVIDER_NOT_READY" }).catch(() => {});
  }
}
export type PaymentEventSource = "webhook" | "return" | "callback" | "cancel" | "checkout";
export type PaymentEventContext = { source: PaymentEventSource; requestId?: string | null };
type PaymentEventStatus = "paid" | "pending" | "failed" | "canceled" | "review" | "unknown" | "verification_failed" | "unauthorized";
/** Payment state log. Invoice and expected amount are resolved in SQL from the attempt; no secrets or card data. Never throws. */
export async function logPaymentEvent(source: PaymentEventSource, status: PaymentEventStatus, details: { attempt?: string | null; providerAmountHalalas?: number | null; requestId?: string | null } = {}) {
  try {
    await billingCall("ec_billing_event_log", { event_source: source, event_status: status, attempt: details.attempt ?? null, provider_amount: details.providerAmountHalalas ?? null, request_ref: details.requestId ?? null });
  } catch { console.error("payments.event_log_failed", { source, status }); }
}
export async function verifyPlatformPayment(params: { transactionNo?: string | null; orderNumber?: string | null }, context: PaymentEventContext = { source: "return" }): Promise<VerifyResult> {
  const trace: { attempt?: string; providerAmountHalalas?: number } = {};
  let result: VerifyResult;
  try { result = await verifyOnce(params, trace); }
  catch (error) {
    await logPaymentEvent(context.source, "verification_failed", { ...trace, requestId: context.requestId });
    throw error;
  }
  // Unmatched return URLs are not logged: anyone can craft one. Authenticated webhooks are.
  if (trace.attempt || context.source === "webhook")
    await logPaymentEvent(context.source, result.state === "error" ? "verification_failed" : result.state, { ...trace, requestId: context.requestId });
  return result;
}
async function verifyOnce(params: { transactionNo?: string | null; orderNumber?: string | null }, trace: { attempt?: string; providerAmountHalalas?: number }): Promise<VerifyResult> {
  const { transactionNo, orderNumber } = params;
  if ((transactionNo && !/^[A-Za-z0-9-]{1,64}$/.test(transactionNo)) || (orderNumber && !/^ECP-[a-f0-9]{32}$/.test(orderNumber)) || (!transactionNo && !orderNumber)) return { state: "unknown", errors: [] };
  const stored = await billingCall<Attempt | null>("ec_billing_lookup", { transaction: transactionNo ?? null, order_no: orderNumber ?? null });
  if (!stored || (orderNumber && stored.order_no !== orderNumber) || (stored.transaction_no && transactionNo && stored.transaction_no !== transactionNo)) return { state: "unknown", errors: [] };
  trace.attempt = stored.id;
  // Verification remains allowed when new invoice creation is disabled.
  const merchant = platformMerchant(), transaction = stored.transaction_no ?? transactionNo;
  if (!merchant) return { state: "error", errors: [] };
  if (!transaction) return { state: "pending", errors: [] };
  try {
    const remote = await merchant.getInvoice(transaction);
    if (remote.transactionNo !== transaction) return { state: "error", errors: [] };
    const amount = Math.round(remote.amount * 100);
    if (!Number.isSafeInteger(amount) || Math.abs(amount-remote.amount*100)>0.00001) return { state: "error", errors: [] };
    trace.providerAmountHalalas = amount;
    const state = await billingCall<VerifyResult["state"]>("ec_billing_settle", { attempt: stored.id, transaction, order_no: remote.orderNumber, amount, currency_code: remote.currency,
      provider_status: remote.rawStatus ?? remote.orderStatus, provider_paid_at: remote.paidAt ?? null, errors: remote.paymentErrors });
    return { state, errors: [], ...(["paid","review"].includes(state) ? { amount: remote.amount } : {}) };
  } catch (error) { await recordProviderIssue(error, stored.owner_id); throw error; }
}

/** One period can have several historical attempts, but only one payable link at a time. */
export async function checkoutPlatform(input: { owner: string; plan: PaidPlan; total?: number; email: string }) {
  const readiness = await paymentReadiness();
  if (!readiness.ready) {
    await billingCall("ec_billing_refresh", { owner: input.owner, blocked: readiness.blocked });
    throw Error(readiness.blocked === "TAX_NOT_CONFIGURED" ? "tax_not_configured" : "provider_not_ready");
  }
  const merchant = platformMerchant()!;
  await billingCall("ec_billing_refresh", { owner: input.owner, blocked: null });
  const app = new URL(process.env.APP_URL ?? "");
  if (process.env.NODE_ENV === "production" && app.protocol !== "https:") throw Error("provider_not_ready");
  try {
    await merchant.auth();
    let attempt = await billingCall<Attempt>("ec_billing_prepare", { owner: input.owner, plan_code: input.plan, expected_total: input.total ?? null });
    if (!attempt.created) {
      if (!attempt.transaction_no) throw Error("payment_pending");
      const result = await verifyPlatformPayment({ transactionNo: attempt.transaction_no }, { source: "checkout" });
      if (result.state === "paid" || result.state === "review") return `${app.origin}/subscription`;
      // A decline stays Pending at Paylink: keep the same payable link.
      if (["pending","failed"].includes(result.state) && attempt.payment_url) return attempt.payment_url;
      if (result.state !== "canceled") throw Error("payment_pending");
      attempt = await billingCall<Attempt>("ec_billing_prepare", { owner: input.owner, plan_code: input.plan, expected_total: input.total ?? null });
      if (!attempt.created) throw Error("payment_pending");
    }
    const created = await merchant.createInvoice({ orderNumber: attempt.order_no, amount: attempt.amount_halalas/100,
      clientName: attempt.customer_name || input.email, clientMobile: attempt.mobile, clientEmail: input.email,
      callBackUrl: `${app.origin}/subscription?payment=return&orderNumber=${attempt.order_no}`,
      cancelUrl: `${app.origin}/payments/paylink/cancel?orderNumber=${attempt.order_no}`,
      products: [{ title: `EasyCoach · ${plans[attempt.plan].name} · 30 يومًا`, price: attempt.amount_halalas/100, qty: 1 }] });
    await billingCall("ec_billing_attach", { attempt: attempt.id, transaction: created.transactionNo, url: created.url });
    return created.url;
  } catch (error) { await recordProviderIssue(error, input.owner); throw error; }
}
export async function runBillingJobs() {
  if (!paymentsEnabled()) return { processed: 0, disabled: true };
  const jobs = await billingCall<{ owner_id: string; billing_plan: PaidPlan; email: string }[]>("ec_billing_jobs");
  let processed=0, failed=0;
  const deadline=Date.now()+40000;
  for (let offset=0;offset<jobs.length&&Date.now()<deadline;offset+=5) {
    await Promise.all(jobs.slice(offset,offset+5).map(async job=>{
      try { await checkoutPlatform({ owner: job.owner_id, plan: job.billing_plan, email: job.email }); processed++; }
      catch { failed++; }
    }));
  }
  return { processed, failed };
}

/** Vercel's request ID, for matching a payment log row to a function log. Not a secret. */
export function requestRef(headers: Pick<Headers, "get">) { return headers.get("x-vercel-id") ?? headers.get("x-request-id") ?? null; }
