import { describe, expect, it } from "vitest";
import type { PaylinkClient, PaylinkInvoice, PaymentError } from "@/lib/paylink/client";
import { PaylinkError } from "@/lib/paylink/client";
import { newOrderNumber, normalizeSaudiMobile, startCheckout, verifyTransaction, type FlowDeps, type FlowStore } from "@/lib/paylink/flow";
import type { CheckoutContext, StoredInvoice } from "@/lib/paylink/store";
import { payableSubscriptions } from "@/components/paylink-pay";
import { paylinkReturnParams } from "@/lib/paylink/params";

const COACH = "11111111-1111-4111-8111-111111111111";
const SUB = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** In-memory store with the same rules as the SQL functions. */
function memoryStore(price = 300, phone = "0501234567") {
  const invoices: (StoredInvoice & { payment_url: string | null; created_at: string })[] = [];
  const payments: number[] = [];
  const store: FlowStore & { invoices: typeof invoices; payments: number[] } = {
    invoices,
    payments,
    async checkoutContext(trainee) {
      if (trainee !== "trainee-1") return null;
      const paid = payments.reduce((a, b) => a + b, 0);
      const ctx: CheckoutContext = {
        coach_id: COACH,
        client_id: "client-1",
        subscription_id: SUB,
        subscription_name: "شهري",
        price,
        outstanding: Math.max(price - paid, 0),
        client_name: "متدرب تجريبي",
        client_email: "t@example.test",
        client_phone: phone,
        recent_invoices: invoices.length,
        pending: invoices
          .filter((i) => i.status === "pending" && i.transaction_no)
          .map((i) => ({ order_number: i.order_number, transaction_no: i.transaction_no!, amount: i.amount, payment_url: i.payment_url, created_at: i.created_at, expires_at: i.created_at })),
      };
      return ctx;
    },
    async invoiceOpen(coach, subscription, client, orderNo, total) {
      invoices.unshift({ id: orderNo, coach_id: coach, subscription_id: subscription, client_id: client, order_number: orderNo, transaction_no: null, amount: total, status: "pending", payment_errors: [], review_reason: null, payment_url: null, created_at: new Date().toISOString() });
      return orderNo;
    },
    async invoiceAttach(orderNo, tx, url) {
      const i = invoices.find((x) => x.order_number === orderNo)!;
      i.transaction_no = tx;
      i.payment_url = url;
      return true;
    },
    async invoiceAbandon(orderNo) {
      invoices.find((x) => x.order_number === orderNo)!.status = "failed";
      return true;
    },
    async invoiceLookup(tx, orderNo) {
      return invoices.find((i) => (tx ? i.transaction_no === tx : i.order_number === orderNo)) ?? null;
    },
    async invoiceSettle(tx, amount) {
      const i = invoices.find((x) => x.transaction_no === tx)!;
      if (i.status === "paid") return { outcome: "duplicate" };
      if (Math.abs(amount - i.amount) >= 0.01) {
        i.status = "review";
        return { outcome: "review", reason: "amount_mismatch" };
      }
      payments.push(i.amount);
      i.status = "paid";
      return { outcome: "activated" };
    },
    async invoiceMark(tx, status, errors: PaymentError[]) {
      const i = invoices.find((x) => x.transaction_no === tx)!;
      i.status = status;
      i.payment_errors = errors;
      return true;
    },
  };
  return store;
}

/** A Paylink that remembers invoices; `pay()` simulates the customer paying on Paylink's page. */
function fakeClient() {
  const remote = new Map<string, PaylinkInvoice>();
  let next = 1716194603000;
  const created: { orderNumber: string; amount: number; clientMobile: string; title: string }[] = [];
  const client: PaylinkClient = {
    auth: async () => "token",
    async createInvoice(input) {
      const tx = String(++next);
      created.push({ orderNumber: input.orderNumber, amount: input.amount, clientMobile: input.clientMobile, title: input.products[0].title });
      remote.set(tx, { transactionNo: tx, orderNumber: input.orderNumber, currency: "SAR", orderStatus: "Pending", amount: input.amount, paymentType: null, paymentErrors: [] });
      return { transactionNo: tx, url: `https://payment.paylink.sa/pay/info/${tx}`, orderStatus: "PENDING" };
    },
    async getInvoice(tx) {
      const invoice = remote.get(tx);
      if (!invoice) throw new PaylinkError("http", 404);
      return { ...invoice };
    },
  };
  return {
    client,
    created,
    pay: (tx: string, amount?: number) => Object.assign(remote.get(tx)!, { orderStatus: "Paid", paymentType: "mada", ...(amount ? { amount } : {}) }),
    decline: (tx: string) => Object.assign(remote.get(tx)!, { paymentErrors: [{ errorCode: "51", errorTitle: "Declined", errorMessage: "Insufficient funds", errorTime: "" }] }),
    cancel: (tx: string) => Object.assign(remote.get(tx)!, { orderStatus: "Canceled" }),
  };
}

function setup(price = 300, phone = "0501234567") {
  const store = memoryStore(price, phone);
  const paylink = fakeClient();
  const logs: string[] = [];
  const deps: FlowDeps = {
    store,
    clientFor: async (coach) => (coach === COACH ? paylink.client : null),
    appUrl: "https://easycoach.space",
    log: (event, detail) => logs.push(JSON.stringify({ event, ...detail })),
  };
  return { store, paylink, deps, logs };
}

const checkout = (deps: FlowDeps, extra: { mobile?: string } = {}) => startCheckout(deps, { userId: "trainee-1", subscriptionId: SUB, ...extra });

describe("audit payment failure boundaries", () => {
  it.each([null, "USD"])("refuses missing or foreign settlement currency (%s)", async (currency) => {
    const { deps, paylink, store } = setup();
    await checkout(deps);
    const tx = store.invoices[0].transaction_no!;
    paylink.pay(tx);
    const original = paylink.client.getInvoice;
    paylink.client.getInvoice = async (id) => ({ ...await original(id), currency });
    expect(await verifyTransaction(deps, { transactionNo: tx })).toMatchObject({ state: "error" });
    expect(store.payments).toEqual([]);
  });
  it("keeps an uncertain creation reserved and recovers it only from verified merchant data", async () => {
    const { deps, paylink, store } = setup();
    const create = paylink.client.createInvoice;
    let tx = "";
    paylink.client.createInvoice = async (input) => {
      tx = (await create(input)).transactionNo;
      throw new PaylinkError("network");
    };
    expect(await checkout(deps)).toEqual({ kind: "error", code: "unavailable" });
    expect(store.invoices[0]).toMatchObject({ status: "pending", transaction_no: null });
    const order = store.invoices[0].order_number;
    // Untrusted webhook references alone must never change the ledger.
    expect(await verifyTransaction(deps, { transactionNo: "999", orderNumber: order })).toMatchObject({ state: "error" });
    expect(store.payments).toEqual([]);
    expect(store.invoices[0].transaction_no).toBeNull();
    paylink.pay(tx);
    expect(await verifyTransaction(deps, { transactionNo: tx, orderNumber: order })).toMatchObject({ state: "paid" });
    expect(await verifyTransaction(deps, { transactionNo: tx, orderNumber: order })).toMatchObject({ state: "paid" });
    expect(store.payments).toEqual([300]);
    expect(paylink.created).toHaveLength(1);
  });

  it("refuses a paid response without the merchant order number", async () => {
    const { deps, paylink, store } = setup();
    await checkout(deps);
    const tx = store.invoices[0].transaction_no!;
    paylink.pay(tx);
    const original = paylink.client.getInvoice;
    paylink.client.getInvoice = async (id) => ({ ...await original(id), orderNumber: null });
    expect(await verifyTransaction(deps, { transactionNo: tx })).toMatchObject({ state: "error" });
    expect(store.payments).toEqual([]);
  });

  it("does not offer payment when the database did not attach the transaction", async () => {
    const { deps, store } = setup();
    store.invoiceAttach = async () => null;
    expect(await checkout(deps)).toEqual({ kind: "error", code: "unavailable" });
    expect(store.invoices[0].transaction_no).toBeNull();
  });

  it("does not create another invoice when an existing invoice cannot be verified", async () => {
    const { deps, paylink, store } = setup();
    await checkout(deps);
    paylink.client.getInvoice = async () => { throw new PaylinkError("network"); };
    expect(await checkout(deps)).toEqual({ kind: "error", code: "unavailable" });
    expect(paylink.created).toHaveLength(1);
    expect(store.payments).toEqual([]);
  });
});

describe("checkout", () => {
  it("creates an invoice for what is owed, titled with the package name", async () => {
    const { deps, paylink, store } = setup(300);
    const result = await checkout(deps);
    expect(result).toMatchObject({ kind: "redirect", reused: false });
    expect(paylink.created[0]).toMatchObject({ amount: 300, clientMobile: "0501234567", title: "اشتراك إيزي كوتش - شهري" });
    expect(store.invoices[0]).toMatchObject({ status: "pending", amount: 300 });
    expect(store.invoices[0].transaction_no).toBeTruthy();
  });

  it("reuses a still-payable invoice instead of creating another", async () => {
    const { deps, paylink } = setup();
    const first = await checkout(deps);
    const second = await checkout(deps);
    expect(second).toEqual({ kind: "redirect", url: (first as { url: string }).url, reused: true });
    expect(paylink.created).toHaveLength(1);
  });

  it("reuses an invoice after a declined card (Paylink keeps it Pending and payable)", async () => {
    const { deps, paylink, store } = setup();
    const first = await checkout(deps);
    paylink.decline(store.invoices[0].transaction_no!);
    expect(await checkout(deps)).toEqual({ kind: "redirect", url: (first as { url: string }).url, reused: true });
    expect(paylink.created).toHaveLength(1);
  });

  it("settles an earlier invoice that was paid meanwhile, and never charges twice", async () => {
    const { deps, paylink, store } = setup();
    await checkout(deps);
    paylink.pay(store.invoices[0].transaction_no!);
    expect(await checkout(deps)).toEqual({ kind: "error", code: "paid" });
    expect(store.payments).toEqual([300]);
    expect(paylink.created).toHaveLength(1);
  });

  it("makes a new invoice once Paylink canceled the old one (24h expiry)", async () => {
    const { deps, paylink, store } = setup();
    await checkout(deps);
    paylink.cancel(store.invoices[0].transaction_no!);
    const result = await checkout(deps);
    expect(result).toMatchObject({ kind: "redirect", reused: false });
    expect(store.invoices.map((i) => i.status)).toEqual(["pending", "canceled"]);
  });

  it("asks for a mobile number when the client has none, and accepts +966 or Arabic digits", async () => {
    const { deps, paylink } = setup(300, "");
    expect(await checkout(deps)).toEqual({ kind: "needs_mobile" });
    expect(await checkout(deps, { mobile: "+966 50 123 4567" })).toMatchObject({ kind: "redirect" });
    expect(paylink.created[0].clientMobile).toBe("0501234567");
    expect(normalizeSaudiMobile("٠٥٠١٢٣٤٥٦٧")).toBe("0501234567");
    expect(normalizeSaudiMobile("0401234567")).toBeNull();
  });

  it("refuses under 5 SAR, unknown subscriptions and coaches without Paylink", async () => {
    expect(await checkout(setup(4).deps)).toEqual({ kind: "error", code: "below_minimum" });
    const { deps } = setup();
    expect(await startCheckout(deps, { userId: "someone-else", subscriptionId: SUB })).toEqual({ kind: "error", code: "not_found" });
    expect(await checkout({ ...deps, clientFor: async () => null })).toEqual({ kind: "error", code: "not_enabled" });
  });

  it("logs codes and order numbers only when Paylink fails", async () => {
    const { deps, store, logs } = setup();
    deps.clientFor = async () => ({
      auth: async () => "t",
      getInvoice: async () => {
        throw new PaylinkError("http", 500);
      },
      createInvoice: async () => {
        throw new PaylinkError("auth_failed", 401);
      },
    });
    expect(await checkout(deps)).toEqual({ kind: "error", code: "unavailable" });
    expect(store.invoices[0].status).toBe("failed");
    expect(logs.join()).toContain("auth_failed:401");
    expect(logs.join()).not.toMatch(/0501234567|example\.test|متدرب/);
  });
});

describe("verify (callback and webhook)", () => {
  async function invoiceFor() {
    const ctx = setup();
    await checkout(ctx.deps);
    return { ...ctx, tx: ctx.store.invoices[0].transaction_no!, order: ctx.store.invoices[0].order_number };
  }

  it("activates only when getInvoice says Paid, whatever the URL claims", async () => {
    const { deps, paylink, store, tx, order } = await invoiceFor();
    expect(await verifyTransaction(deps, { transactionNo: tx, orderNumber: order })).toMatchObject({ state: "pending" });
    expect(store.payments).toEqual([]);
    paylink.pay(tx);
    expect(await verifyTransaction(deps, { transactionNo: tx, orderNumber: order })).toMatchObject({ state: "paid", amount: 300 });
    // Webhook after the callback: idempotent.
    expect(await verifyTransaction(deps, { transactionNo: tx })).toMatchObject({ state: "paid" });
    expect(store.payments).toEqual([300]);
  });

  it("holds a paid amount that differs from the invoice for review", async () => {
    const { deps, paylink, store, tx } = await invoiceFor();
    paylink.pay(tx, 5);
    expect(await verifyTransaction(deps, { transactionNo: tx })).toMatchObject({ state: "review" });
    expect(store.payments).toEqual([]);
  });

  it("returns Paylink's paymentErrors for a declined card and a cancel for an expired invoice", async () => {
    const { deps, paylink, tx } = await invoiceFor();
    paylink.decline(tx);
    expect(await verifyTransaction(deps, { transactionNo: tx })).toMatchObject({ state: "failed", errors: [{ errorCode: "51", errorMessage: "Insufficient funds" }] });
    paylink.cancel(tx);
    expect(await verifyTransaction(deps, { transactionNo: tx })).toMatchObject({ state: "canceled" });
  });

  it("ignores unknown or mismatched references", async () => {
    const { deps, order, tx } = await invoiceFor();
    expect(await verifyTransaction(deps, { transactionNo: "999" })).toMatchObject({ state: "unknown" });
    expect(await verifyTransaction(deps, { transactionNo: tx, orderNumber: "EC-OTHER000-X" })).toMatchObject({ state: "unknown" });
    expect(await verifyTransaction(deps, { transactionNo: "../../etc" })).toMatchObject({ state: "unknown" });
    expect(await verifyTransaction(deps, { orderNumber: order })).toMatchObject({ state: "pending" });
  });

  it("refuses an invoice Paylink reports under a different order number", async () => {
    const { deps, paylink, store, tx } = await invoiceFor();
    paylink.pay(tx);
    const client = (await deps.clientFor(COACH))!;
    const original = client.getInvoice;
    client.getInvoice = async (id) => ({ ...(await original(id)), orderNumber: "EC-SOMEONE0-ELSE" });
    expect(await verifyTransaction(deps, { transactionNo: tx })).toMatchObject({ state: "error" });
    expect(store.payments).toEqual([]);
  });
});

describe("helpers", () => {
  it("builds unique order numbers that fit the database format", () => {
    const a = newOrderNumber(SUB), b = newOrderNumber(SUB);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^EC-[A-Z0-9-]{8,60}$/);
  });

  it("reads TransactionNo / OrderNumber in any case", () => {
    expect(paylinkReturnParams({ TransactionNo: "1716", OrderNumber: "EC-AAAA1111-B" })).toEqual({ transactionNo: "1716", orderNumber: "EC-AAAA1111-B" });
    expect(paylinkReturnParams({ transactionNo: ["9", "8"] })).toEqual({ transactionNo: "9", orderNumber: null });
  });

  it("offers payment only for what is owed on current or upcoming subscriptions", () => {
    const base = { client_id: "c", previous_id: null, created_at: "" };
    const subs = [
      { ...base, id: "old", name: "قديم", start_date: "2026-09-01", end_date: "2026-09-30", price: 300 },
      { ...base, id: "now", name: "حالي", start_date: "2026-11-01", end_date: "2026-11-30", price: 300 },
      { ...base, id: "next", name: "تجديد", start_date: "2026-12-01", end_date: "2026-12-31", price: 300 },
    ];
    const rows = payableSubscriptions(subs, [{ subscription_id: "now", amount: 100 }, { subscription_id: "next", amount: 300 }], "2026-11-13");
    expect(rows.map((r) => [r.subscription.id, r.outstanding])).toEqual([["now", 200]]);
  });
});
