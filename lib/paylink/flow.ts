import { randomBytes } from "node:crypto";
import { MIN_INVOICE_AMOUNT, PaylinkError, type PaylinkClient, type PaylinkInvoice, type PaymentError } from "./client";
import type { CheckoutContext, SettleResult, StoredInvoice } from "./store";

/**
 * The payment rules, free of database and network so every path is tested.
 * Only getInvoice decides whether money arrived. Callback parameters and webhook
 * bodies are used only to find which invoice to ask Paylink about.
 */

export type FlowStore = {
  checkoutContext(trainee: string, subscription: string): Promise<CheckoutContext | null>;
  invoiceOpen(coach: string, subscription: string, client: string, orderNo: string, total: number): Promise<string>;
  invoiceAttach(orderNo: string, transaction: string, url: string | null): Promise<boolean | null>;
  invoiceAbandon(orderNo: string): Promise<boolean | null>;
  invoiceLookup(transaction: string | null, orderNo: string | null): Promise<StoredInvoice | null>;
  invoiceSettle(transaction: string, paidAmount: number, methodType: string | null): Promise<SettleResult>;
  invoiceMark(transaction: string, nextStatus: "pending" | "canceled" | "failed", errors: PaymentError[]): Promise<boolean>;
};

export type FlowLog = (event: string, detail?: Record<string, string | number | boolean | null>) => void;

export type FlowDeps = {
  store: FlowStore;
  clientFor(coachId: string): Promise<PaylinkClient | null>;
  appUrl: string;
  log: FlowLog;
  now?: () => number;
};

export type CheckoutResult =
  | { kind: "redirect"; url: string; reused: boolean }
  | { kind: "needs_mobile" }
  | { kind: "error"; code: "not_found" | "not_enabled" | "paid" | "below_minimum" | "rate_limited" | "unavailable" };

export type VerifyResult = {
  state: "paid" | "review" | "pending" | "canceled" | "failed" | "unknown" | "error";
  errors: PaymentError[];
  amount?: number;
};

// Paylink cancels unpaid invoices after 24 hours. Stop reusing a link an hour before that.
const REUSE_WINDOW_MS = 23 * 3600_000;

/** Saudi mobile in the local 05XXXXXXXX form, or null. Accepts +966 / 966 / 00966 and Arabic-Indic digits. */
export function normalizeSaudiMobile(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s()+-]/g, "");
  const local = digits.replace(/^(00966|966)/, "0");
  return /^05\d{8}$/.test(local) ? local : null;
}

export function newOrderNumber(subscriptionId: string, now = Date.now()): string {
  const sub = subscriptionId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `EC-${sub}-${now.toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.01;

function errorCode(error: unknown): string {
  if (error instanceof PaylinkError) return `${error.code}${error.status ? `:${error.status}` : ""}`;
  // The class name only: messages can carry SQL values or response text.
  return `internal:${error instanceof Error ? error.name.replace(/[^A-Za-z]/g, "").slice(0, 40) : typeof error}`;
}

async function applyInvoice(deps: FlowDeps, stored: StoredInvoice, invoice: PaylinkInvoice): Promise<VerifyResult> {
  const tx = stored.transaction_no!;
  if (invoice.transactionNo !== tx || invoice.orderNumber !== stored.order_number || invoice.currency !== "SAR") {
    deps.log("paylink.verify.mismatch", { order: stored.order_number });
    return { state: "error", errors: [] };
  }
  if (invoice.orderStatus === "Paid") {
    const settled = await deps.store.invoiceSettle(tx, invoice.amount, invoice.paymentType);
    if (settled.outcome === "review") {
      deps.log("paylink.settle.review", { order: stored.order_number, reason: settled.reason ?? null });
      return { state: "review", errors: [], amount: invoice.amount };
    }
    deps.log(settled.outcome === "activated" ? "paylink.settle.activated" : "paylink.settle.duplicate", { order: stored.order_number });
    return { state: "paid", errors: [], amount: invoice.amount };
  }
  if (invoice.orderStatus === "Canceled") {
    await deps.store.invoiceMark(tx, "canceled", invoice.paymentErrors);
    return { state: "canceled", errors: invoice.paymentErrors, amount: stored.amount };
  }
  // A declined card leaves the invoice Pending with paymentErrors until Paylink cancels it.
  if (invoice.paymentErrors.length) {
    await deps.store.invoiceMark(tx, "pending", invoice.paymentErrors);
    return { state: "failed", errors: invoice.paymentErrors, amount: stored.amount };
  }
  return { state: "pending", errors: [], amount: stored.amount };
}

/** Ask Paylink about one invoice and record the result. Safe to call any number of times. */
export async function verifyTransaction(deps: FlowDeps, ref: { transactionNo?: string | null; orderNumber?: string | null }): Promise<VerifyResult> {
  const tx = ref.transactionNo && /^[A-Za-z0-9-]{1,64}$/.test(ref.transactionNo) ? ref.transactionNo : null;
  const order = ref.orderNumber && /^EC-[A-Z0-9-]{8,60}$/.test(ref.orderNumber) ? ref.orderNumber : null;
  if (!tx && !order) return { state: "unknown", errors: [] };
  let stored = await deps.store.invoiceLookup(tx, tx ? null : order);
  // addInvoice may have succeeded while its acknowledgement or local attach failed.
  // Recover only after the merchant API confirms BOTH references below.
  if (!stored && tx && order) stored = await deps.store.invoiceLookup(null, order);
  if (!stored || (!stored.transaction_no && !tx)) return { state: "unknown", errors: [] };
  // Both given (a callback): they must name the same invoice.
  if (tx && order && stored.order_number !== order) return { state: "unknown", errors: [] };
  if (stored.status === "paid") return { state: "paid", errors: [], amount: stored.amount };
  if (stored.status === "review") return { state: "review", errors: [], amount: stored.amount };
  const client = await deps.clientFor(stored.coach_id);
  if (!client) {
    deps.log("paylink.verify.not_configured", { order: stored.order_number });
    return { state: "error", errors: [] };
  }
  try {
    if (!stored.transaction_no && tx) {
      const invoice = await client.getInvoice(tx);
      if (invoice.transactionNo !== tx || invoice.orderNumber !== stored.order_number || invoice.currency !== "SAR") return { state: "error", errors: [] };
      const attached = await deps.store.invoiceAttach(stored.order_number, tx, null);
      if (!attached) {
        const current = await deps.store.invoiceLookup(tx, null);
        if (!current || current.id !== stored.id) return { state: "error", errors: [] };
      }
      return await applyInvoice(deps, { ...stored, transaction_no: tx }, invoice);
    }
    return await applyInvoice(deps, stored, await client.getInvoice(stored.transaction_no!));
  } catch (error) {
    deps.log("paylink.verify.failed", { order: stored.order_number, code: errorCode(error) });
    return { state: "error", errors: stored.payment_errors ?? [] };
  }
}

export async function startCheckout(
  deps: FlowDeps,
  input: { userId: string; subscriptionId: string; mobile?: string | null },
): Promise<CheckoutResult> {
  const now = deps.now ?? Date.now;
  let context = await deps.store.checkoutContext(input.userId, input.subscriptionId);
  if (!context) return { kind: "error", code: "not_found" };
  const client = await deps.clientFor(context.coach_id);
  if (!client) return { kind: "error", code: "not_enabled" };

  // Earlier invoices first: one may already be paid (then never charge twice), or still payable.
  let reuse: string | null = null;
  let settledEarlier = false;
  for (const pending of context.pending.slice(0, 3)) {
    try {
      const invoice = await client.getInvoice(pending.transaction_no);
      const stored = await deps.store.invoiceLookup(pending.transaction_no, null);
      if (!stored) continue;
      const result = await applyInvoice(deps, stored, invoice);
      if (result.state === "error") return { kind: "error", code: "unavailable" };
      if (result.state === "paid" || result.state === "review") settledEarlier = true;
      // A declined card ("failed") leaves the invoice Pending and still payable: reuse it too.
      else if (
        (result.state === "pending" || result.state === "failed") &&
        !reuse &&
        pending.payment_url &&
        sameAmount(pending.amount, context.outstanding) &&
        now() - Date.parse(pending.created_at) < REUSE_WINDOW_MS
      )
        reuse = pending.payment_url;
    } catch (error) {
      deps.log("paylink.checkout.recheck_failed", { order: pending.order_number, code: errorCode(error) });
      // Its payment state is unknown. Creating a replacement could charge twice.
      return { kind: "error", code: "unavailable" };
    }
  }
  if (settledEarlier) {
    context = await deps.store.checkoutContext(input.userId, input.subscriptionId);
    if (!context) return { kind: "error", code: "not_found" };
    reuse = null;
  }

  if (context.outstanding <= 0) return { kind: "error", code: "paid" };
  if (context.outstanding < MIN_INVOICE_AMOUNT) return { kind: "error", code: "below_minimum" };
  if (reuse) return { kind: "redirect", url: reuse, reused: true };
  if (context.recent_invoices >= 6) return { kind: "error", code: "rate_limited" };

  const mobile = normalizeSaudiMobile(input.mobile) ?? normalizeSaudiMobile(context.client_phone);
  if (!mobile) return { kind: "needs_mobile" };

  const orderNumber = newOrderNumber(context.subscription_id, now());
  try {
    await deps.store.invoiceOpen(context.coach_id, context.subscription_id, context.client_id, orderNumber, context.outstanding);
  } catch (error) {
    if ((error as { code?: string }).code === "P0429") return { kind: "error", code: "rate_limited" };
    if ((error as { code?: string }).code === "P0409") return { kind: "error", code: "unavailable" };
    throw error;
  }
  try {
    const created = await client.createInvoice({
      orderNumber,
      amount: context.outstanding,
      clientName: context.client_name,
      clientMobile: mobile,
      clientEmail: context.client_email.endsWith(".invalid") ? undefined : context.client_email,
      callBackUrl: `${deps.appUrl}/payments/paylink/callback`,
      cancelUrl: `${deps.appUrl}/payments/paylink/cancel`,
      products: [{ title: `اشتراك إيزي كوتش - ${context.subscription_name}`.slice(0, 200), price: context.outstanding, qty: 1 }],
    });
    const attached = await deps.store.invoiceAttach(orderNumber, created.transactionNo, created.url);
    if (!attached) throw new PaylinkError("invalid_response");
    deps.log("paylink.checkout.created", { order: orderNumber });
    return { kind: "redirect", url: created.url, reused: false };
  } catch (error) {
    // Only a definite rejection before invoice creation permits another attempt.
    // Network/HTTP/attach failures may hide a payable remote invoice: keep the
    // reservation for verified callback/webhook recovery instead of charging again.
    if (error instanceof PaylinkError && ["auth_failed", "rejected"].includes(error.code))
      await deps.store.invoiceAbandon(orderNumber).catch(() => null);
    deps.log("paylink.checkout.failed", { order: orderNumber, code: errorCode(error) });
    return { kind: "error", code: "unavailable" };
  }
}
