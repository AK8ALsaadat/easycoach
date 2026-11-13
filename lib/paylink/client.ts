import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Paylink API v2 (https://developer.paylink.sa). One instance per merchant account.
 * Field names follow the docs: /api/auth, /api/addInvoice, /api/getInvoice/{transactionNo}.
 * Errors carry a code and an HTTP status only: keys, tokens, card data and response bodies
 * never reach a log or an error message.
 */

export const PAYLINK_HOSTS = { live: "restapi.paylink.sa", test: "restpilot.paylink.sa" } as const;
export const MIN_INVOICE_AMOUNT = 5;
const TIMEOUT_MS = 12_000;
// persistToken:false gives a 30-minute token. Refresh well before it lapses.
const TOKEN_LIFETIME_MS = 30 * 60_000;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

export type PaylinkErrorCode = "not_configured" | "auth_failed" | "http" | "invalid_response" | "rejected" | "network";

export class PaylinkError extends Error {
  constructor(
    readonly code: PaylinkErrorCode,
    readonly status?: number,
  ) {
    super(`Paylink ${code}${status ? ` (${status})` : ""}`);
    this.name = "PaylinkError";
  }
}

export type PaylinkCredentials = { baseUrl: string; apiId: string; secretKey: string };

export type PaymentError = { errorCode: string; errorTitle: string; errorMessage: string; errorTime: string };

export type CreateInvoiceInput = {
  orderNumber: string;
  amount: number;
  clientName: string;
  clientMobile: string;
  clientEmail?: string;
  callBackUrl: string;
  cancelUrl: string;
  products: { title: string; price: number; qty: number }[];
};

export type CreatedInvoice = { transactionNo: string; url: string; orderStatus: string };

export type PaylinkInvoice = {
  transactionNo: string;
  orderNumber: string | null;
  currency?: string | null;
  orderStatus: "Paid" | "Pending" | "Canceled" | string;
  amount: number;
  paymentType: string | null;
  paymentErrors: PaymentError[];
};

/**
 * Only Paylink's own API hosts. Loopback is accepted outside production so the whole
 * flow can run against a local mock server while Paylink's test server is down.
 */
export function normalizeBaseUrl(value: string | undefined, production = process.env.NODE_ENV === "production"): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const official = url.protocol === "https:" && Object.values(PAYLINK_HOSTS).includes(url.hostname as never);
    const loopback = !production && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
    if (!official && !loopback) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isTestBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname !== PAYLINK_HOSTS.live;
  } catch {
    return true;
  }
}

/** The link goes straight to the browser, so it must really be Paylink's. */
export function isPaylinkPaymentUrl(value: string, production = process.env.NODE_ENV === "production"): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && (url.hostname === "paylink.sa" || url.hostname.endsWith(".paylink.sa"))) return true;
    return !production && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

const id = z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^[A-Za-z0-9-]{1,64}$/));

const ErrorItem = z
  .object({
    errorCode: z.unknown().optional(),
    errorTitle: z.unknown().optional(),
    errorMessage: z.unknown().optional(),
    errorTime: z.unknown().optional(),
  })
  .passthrough();

/** Error text is shown to the payer, so keep it short and plain. */
function cleanErrors(value: unknown): PaymentError[] {
  const parsed = z.array(ErrorItem).safeParse(value);
  if (!parsed.success) return [];
  const text = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max) : "");
  return parsed.data.slice(0, 5).map((e) => ({
    errorCode: text(e.errorCode, 20),
    errorTitle: text(e.errorTitle, 120),
    errorMessage: text(e.errorMessage, 300),
    errorTime: text(e.errorTime, 40),
  }));
}

const AddInvoiceResponse = z
  .object({ success: z.boolean().optional(), transactionNo: id, url: z.string(), orderStatus: z.string().optional() })
  .passthrough();

const InvoiceResponse = z
  .object({
    transactionNo: id,
    orderStatus: z.string().min(1).max(40),
    amount: z.coerce.number().finite(),
    gatewayOrderRequest: z.object({ orderNumber: z.union([z.string(), z.number()]).transform(String).nullish(), currency: z.string().nullish() }).passthrough().nullish(),
    paymentReceipt: z.object({ paymentMethod: z.string().nullish() }).passthrough().nullish(),
    paymentErrors: z.unknown().optional(),
  })
  .passthrough();

/** Paylink spells statuses in mixed case across pages ("Paid", "paid", "PENDING"). */
export function normalizeStatus(value: string): "Paid" | "Pending" | "Canceled" | string {
  const lower = value.trim().toLowerCase();
  if (lower === "paid") return "Paid";
  if (lower === "pending") return "Pending";
  if (lower === "canceled" || lower === "cancelled") return "Canceled";
  return value.trim();
}

type TokenEntry = { value: string; expiresAt: number };
const tokens = new Map<string, TokenEntry>();
const pendingTokens = new Map<string, Promise<string>>();

export function resetPaylinkTokens() {
  tokens.clear();
  pendingTokens.clear();
}

export function createPaylinkClient(credentials: PaylinkCredentials, fetcher: typeof fetch = fetch, now: () => number = Date.now) {
  const baseUrl = normalizeBaseUrl(credentials.baseUrl);
  if (!baseUrl || !credentials.apiId || !credentials.secretKey) throw new PaylinkError("not_configured");
  // Keyed by the full key pair: an API ID alone must never unlock another account's token.
  const cacheKey = `${baseUrl}|${createHash("sha256").update(`${credentials.apiId}\u0000${credentials.secretKey}`).digest("hex")}`;

  async function call(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetcher(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch {
      throw new PaylinkError("network");
    }
  }

  async function requestToken(): Promise<string> {
    const response = await call("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ apiId: credentials.apiId, secretKey: credentials.secretKey, persistToken: false }),
    });
    if (!response.ok) throw new PaylinkError("auth_failed", response.status);
    const body = z.object({ id_token: z.string().min(1) }).safeParse(await response.json().catch(() => null));
    if (!body.success) throw new PaylinkError("auth_failed", response.status);
    tokens.set(cacheKey, { value: body.data.id_token, expiresAt: now() + TOKEN_LIFETIME_MS });
    return body.data.id_token;
  }

  /**
   * Cached per server instance and key pair. Parallel callers share one request.
   * fresh=true always asks Paylink (used to prove new keys before saving them).
   */
  async function auth(options: { fresh?: boolean } = {}): Promise<string> {
    if (options.fresh) return requestToken();
    const cached = tokens.get(cacheKey);
    if (cached && cached.expiresAt - now() > TOKEN_REFRESH_MARGIN_MS) return cached.value;
    let pending = pendingTokens.get(cacheKey);
    if (!pending) {
      pending = requestToken().finally(() => pendingTokens.delete(cacheKey));
      pendingTokens.set(cacheKey, pending);
    }
    return pending;
  }

  async function send(path: string, init: RequestInit, retry = true): Promise<unknown> {
    const response = await call(path, {
      ...init,
      headers: { Authorization: `Bearer ${await auth()}`, Accept: "application/json", "Content-Type": "application/json" },
    });
    if (response.status === 401 && retry) {
      tokens.delete(cacheKey);
      return send(path, init, false);
    }
    if (!response.ok) throw new PaylinkError(response.status === 400 || response.status === 422 ? "rejected" : "http", response.status);
    return response.json().catch(() => {
      throw new PaylinkError("invalid_response", response.status);
    });
  }

  async function createInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice> {
    if (!(input.amount >= MIN_INVOICE_AMOUNT)) throw new PaylinkError("rejected");
    const raw = await send("/api/addInvoice", {
      method: "POST",
      body: JSON.stringify({
        orderNumber: input.orderNumber,
        amount: input.amount,
        currency: "SAR",
        clientName: input.clientName,
        clientMobile: input.clientMobile,
        ...(input.clientEmail ? { clientEmail: input.clientEmail } : {}),
        callBackUrl: input.callBackUrl,
        cancelUrl: input.cancelUrl,
        products: input.products,
      }),
    });
    const parsed = AddInvoiceResponse.safeParse(raw);
    if (!parsed.success) throw new PaylinkError("invalid_response");
    if (parsed.data.success === false) throw new PaylinkError("rejected");
    if (!isPaylinkPaymentUrl(parsed.data.url)) throw new PaylinkError("invalid_response");
    return { transactionNo: parsed.data.transactionNo, url: parsed.data.url, orderStatus: parsed.data.orderStatus ?? "Pending" };
  }

  async function getInvoice(transactionNo: string): Promise<PaylinkInvoice> {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(transactionNo)) throw new PaylinkError("rejected");
    const raw = await send(`/api/getInvoice/${encodeURIComponent(transactionNo)}`, { method: "GET" });
    const parsed = InvoiceResponse.safeParse(raw);
    if (!parsed.success) throw new PaylinkError("invalid_response");
    return {
      transactionNo: parsed.data.transactionNo,
      orderNumber: parsed.data.gatewayOrderRequest?.orderNumber ?? null,
      currency: parsed.data.gatewayOrderRequest?.currency ?? null,
      orderStatus: normalizeStatus(parsed.data.orderStatus),
      amount: parsed.data.amount,
      paymentType: parsed.data.paymentReceipt?.paymentMethod?.slice(0, 40) ?? null,
      paymentErrors: cleanErrors(parsed.data.paymentErrors),
    };
  }

  return { auth, createInvoice, getInvoice };
}

export type PaylinkClient = ReturnType<typeof createPaylinkClient>;
