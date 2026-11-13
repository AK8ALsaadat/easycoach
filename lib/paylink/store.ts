import "server-only";
import { getLocalDatabase } from "../local-db";
import { localMode, localGuard } from "../server";
import { adminSupportClient } from "../supabase/admin";
import type { PaymentError } from "./client";

/** Server-only Paylink data. Every call goes through a service-role SQL function. */

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!/^paylink_[a-z_]+$/.test(name) || Object.keys(args).some((k) => !/^[a-z_]+$/.test(k))) throw new Error("Invalid call");
  if (localMode()) {
    await localGuard();
    const entries = Object.entries(args);
    const sql = `select public.${name}(${entries.map(([k], i) => `${k}=>$${i + 1}`).join(",")}) as result`;
    // uuid[] goes as a Postgres array literal (ids are validated uuids); jsonb as JSON text.
    const values = entries.map(([k, v]) =>
      k === "coaches" && Array.isArray(v) ? `{${v.join(",")}}` : v !== null && typeof v === "object" ? JSON.stringify(v) : v,
    );
    const result = await (await getLocalDatabase()).query<{ result: T }>(sql, values);
    return result.rows[0].result;
  }
  const { data, error } = await adminSupportClient().rpc(name, args);
  if (error) throw Object.assign(new Error("Paylink store error"), { code: error.code });
  return data as T;
}

export type CheckoutContext = {
  coach_id: string;
  client_id: string;
  subscription_id: string;
  subscription_name: string;
  price: number;
  outstanding: number;
  client_name: string;
  client_email: string;
  client_phone: string;
  recent_invoices: number;
  pending: { order_number: string; transaction_no: string; amount: number; payment_url: string | null; created_at: string; expires_at: string }[];
};

export type StoredInvoice = {
  id: string;
  coach_id: string;
  subscription_id: string;
  client_id: string;
  order_number: string;
  transaction_no: string | null;
  amount: number;
  status: "pending" | "paid" | "canceled" | "failed" | "review";
  payment_errors: PaymentError[];
  review_reason: string | null;
};

export type SettleResult = { outcome: "activated" | "duplicate" | "review"; payment_id?: string; reason?: string };

export const paylinkStore = {
  accountGet: (coach: string) => call<string | null>("paylink_account_get", { coach }),
  accountPut: (coach: string, sealed: string | null) => call<boolean>("paylink_account_put", { coach, sealed }),
  readyCoaches: (coaches: string[]) => call<string[]>("paylink_ready_coaches", { coaches }),
  checkoutContext: async (trainee: string, subscription: string) => {
    const value = await call<CheckoutContext | null>("paylink_checkout_context", { trainee, subscription });
    return value ? { ...value, price: Number(value.price), outstanding: Number(value.outstanding), pending: value.pending.map((p) => ({ ...p, amount: Number(p.amount) })) } : null;
  },
  invoiceOpen: (coach: string, subscription: string, client: string, orderNo: string, total: number) =>
    call<string>("paylink_invoice_open", { coach, subscription, client, order_no: orderNo, total }),
  invoiceAttach: (orderNo: string, transaction: string, url: string) => call<boolean | null>("paylink_invoice_attach", { order_no: orderNo, transaction, url }),
  invoiceAbandon: (orderNo: string) => call<boolean | null>("paylink_invoice_abandon", { order_no: orderNo }),
  invoiceLookup: async (transaction: string | null, orderNo: string | null) => {
    const value = await call<StoredInvoice | null>("paylink_invoice_lookup", { transaction, order_no: orderNo });
    return value ? { ...value, amount: Number(value.amount) } : null;
  },
  invoiceSettle: (transaction: string, paidAmount: number, methodType: string | null) =>
    call<SettleResult>("paylink_invoice_settle", { transaction, paid_amount: paidAmount, method_type: methodType }),
  invoiceMark: (transaction: string, nextStatus: "pending" | "canceled" | "failed", errors: PaymentError[]) =>
    call<boolean>("paylink_invoice_mark", { transaction, next_status: nextStatus, errors }),
};

export type PaylinkStore = typeof paylinkStore;
