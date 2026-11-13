import { beforeEach, describe, expect, it } from "vitest";
import {
  createPaylinkClient,
  isPaylinkPaymentUrl,
  normalizeBaseUrl,
  normalizeStatus,
  PaylinkError,
  resetPaylinkTokens,
} from "@/lib/paylink/client";
import { newWebhookSecret, openAccount, sealAccount } from "@/lib/paylink/seal";

type Call = { url: string; init: RequestInit };

function fakePaylink(routes: Record<string, (call: Call) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const path = new URL(url).pathname;
    const route = Object.entries(routes).find(([p]) => path === p || (p.endsWith("*") && path.startsWith(p.slice(0, -1))));
    return route ? route[1]({ url, init }) : new Response("<html>404</html>", { status: 404 });
  }) as typeof fetch;
  return { fetcher, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const credentials = { baseUrl: "https://restpilot.paylink.sa", apiId: "APP_ID_TEST", secretKey: "secret-value-123" };

beforeEach(() => resetPaylinkTokens());

describe("paylink client", () => {
  it("authenticates once, reuses the token, and refreshes it before 30 minutes pass", async () => {
    let issued = 0;
    const { fetcher, calls } = fakePaylink({
      "/api/auth": () => json({ id_token: `token-${++issued}` }),
      "/api/getInvoice/*": () => json({ transactionNo: "1716194603030", orderStatus: "Pending", amount: 50, paymentErrors: [] }),
    });
    let clock = 0;
    const client = createPaylinkClient(credentials, fetcher, () => clock);
    await Promise.all([client.getInvoice("1716194603030"), client.getInvoice("1716194603030")]);
    expect(calls.filter((c) => c.url.endsWith("/api/auth"))).toHaveLength(1);
    const auth = JSON.parse(String(calls[0].init.body));
    expect(auth).toEqual({ apiId: "APP_ID_TEST", secretKey: "secret-value-123", persistToken: false });
    clock = 26 * 60_000;
    await client.getInvoice("1716194603030");
    expect(issued).toBe(2);
    expect(calls.at(-1)!.init.headers).toMatchObject({ Authorization: "Bearer token-2" });
  });

  it("never lends a cached token to the same API ID with a different secret", async () => {
    const { fetcher, calls } = fakePaylink({
      "/api/auth": ({ init }) => (JSON.parse(String(init.body)).secretKey === "secret-value-123" ? json({ id_token: "owner-token" }) : json({ detail: "Bad credentials" }, 401)),
      "/api/getInvoice/*": () => json({ transactionNo: "1", orderStatus: "Pending", amount: 50 }),
    });
    await createPaylinkClient(credentials, fetcher).getInvoice("1");
    const impostor = createPaylinkClient({ ...credentials, secretKey: "guessed-secret" }, fetcher);
    await expect(impostor.getInvoice("1")).rejects.toMatchObject({ code: "auth_failed" });
    await expect(impostor.auth()).rejects.toMatchObject({ code: "auth_failed" });
    // Proving keys before saving always asks Paylink, even with a warm cache.
    const authCalls = () => calls.filter((c) => c.url.endsWith("/api/auth")).length;
    const before = authCalls();
    await createPaylinkClient(credentials, fetcher).auth({ fresh: true });
    expect(authCalls()).toBe(before + 1);
  });

  it("retries once with a fresh token after a 401", async () => {
    let issued = 0;
    let first = true;
    const { fetcher } = fakePaylink({
      "/api/auth": () => json({ id_token: `token-${++issued}` }),
      "/api/getInvoice/*": () => {
        if (first) {
          first = false;
          return new Response(null, { status: 401 });
        }
        return json({ transactionNo: 1, orderStatus: "paid", amount: "50.00" });
      },
    });
    const invoice = await createPaylinkClient(credentials, fetcher).getInvoice("1");
    expect(issued).toBe(2);
    expect(invoice).toMatchObject({ transactionNo: "1", orderStatus: "Paid", amount: 50 });
  });

  it("sends the documented addInvoice body and returns the payment link", async () => {
    let body: Record<string, unknown> = {};
    const { fetcher } = fakePaylink({
      "/api/auth": () => json({ id_token: "t" }),
      "/api/addInvoice": ({ init }) => {
        body = JSON.parse(String(init.body));
        return json({ success: true, transactionNo: "1716194603030", orderStatus: "PENDING", url: "https://payment.paylink.sa/pay/info/1716194603030", paymentErrors: null });
      },
    });
    const created = await createPaylinkClient(credentials, fetcher).createInvoice({
      orderNumber: "EC-ABCD1234-X",
      amount: 300,
      clientName: "متدرب",
      clientMobile: "0500000000",
      clientEmail: "t@example.test",
      callBackUrl: "https://easycoach.space/payments/paylink/callback",
      cancelUrl: "https://easycoach.space/payments/paylink/cancel",
      products: [{ title: "اشتراك إيزي كوتش - شهري", price: 300, qty: 1 }],
    });
    expect(created).toEqual({ transactionNo: "1716194603030", url: "https://payment.paylink.sa/pay/info/1716194603030", orderStatus: "PENDING" });
    expect(body).toMatchObject({ orderNumber: "EC-ABCD1234-X", amount: 300, currency: "SAR", callBackUrl: "https://easycoach.space/payments/paylink/callback" });
  });

  it("refuses an amount under 5 SAR without calling Paylink, and a payment link off Paylink's domain", async () => {
    const { fetcher, calls } = fakePaylink({
      "/api/auth": () => json({ id_token: "t" }),
      "/api/addInvoice": () => json({ success: true, transactionNo: "1", url: "https://evil.example/pay" }),
    });
    const client = createPaylinkClient(credentials, fetcher);
    const input = { orderNumber: "EC-ABCD1234-X", clientName: "x", clientMobile: "0500000000", callBackUrl: "https://a", cancelUrl: "https://a", products: [] };
    await expect(client.createInvoice({ ...input, amount: 4.99 })).rejects.toMatchObject({ code: "rejected" });
    expect(calls).toHaveLength(0);
    await expect(client.createInvoice({ ...input, amount: 10 })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("keeps keys, tokens and response bodies out of every error", async () => {
    const { fetcher } = fakePaylink({ "/api/auth": () => json({ detail: "Bad credentials secret-value-123" }, 401) });
    const error = await createPaylinkClient(credentials, fetcher)
      .getInvoice("1")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PaylinkError);
    expect(String((error as Error).message)).toBe("Paylink auth_failed (401)");
    expect(JSON.stringify(error)).not.toContain("secret-value-123");
  });

  it("parses paymentErrors and reads the order number back from getInvoice", async () => {
    const { fetcher } = fakePaylink({
      "/api/auth": () => json({ id_token: "t" }),
      "/api/getInvoice/*": () =>
        json({
          transactionNo: "77",
          orderStatus: "Pending",
          amount: 300,
          gatewayOrderRequest: { orderNumber: "EC-ABCD1234-X" },
          paymentErrors: [{ errorCode: "51", errorTitle: "Insufficient funds", errorMessage: "<b>Card declined</b>", errorTime: "2026-11-13" }],
        }),
    });
    const invoice = await createPaylinkClient(credentials, fetcher).getInvoice("77");
    expect(invoice.orderNumber).toBe("EC-ABCD1234-X");
    expect(invoice.paymentErrors).toEqual([{ errorCode: "51", errorTitle: "Insufficient funds", errorMessage: "b Card declined /b", errorTime: "2026-11-13" }]);
  });

  it("accepts only Paylink's API hosts (loopback only outside production)", () => {
    expect(normalizeBaseUrl("https://restapi.paylink.sa/")).toBe("https://restapi.paylink.sa");
    expect(normalizeBaseUrl("https://restpilot.paylink.sa")).toBe("https://restpilot.paylink.sa");
    expect(normalizeBaseUrl("https://evil.example")).toBeNull();
    expect(normalizeBaseUrl("http://restapi.paylink.sa")).toBeNull();
    expect(normalizeBaseUrl("https://restapi.paylink.sa/api")).toBeNull();
    expect(normalizeBaseUrl("http://127.0.0.1:4010", false)).toBe("http://127.0.0.1:4010");
    expect(normalizeBaseUrl("http://127.0.0.1:4010", true)).toBeNull();
    expect(isPaylinkPaymentUrl("https://payment.paylink.sa/pay/info/1", true)).toBe(true);
    expect(isPaylinkPaymentUrl("https://paylink.sa.evil.example/pay", true)).toBe(false);
    expect(normalizeStatus("PENDING")).toBe("Pending");
    expect(normalizeStatus("cancelled")).toBe("Canceled");
  });
});

describe("sealed coach keys", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const account = { apiId: "APP_ID_1", secretKey: "secret-key-value", webhookSecret: newWebhookSecret() };

  it("round-trips and never contains the plain secret", () => {
    const sealed = sealAccount(account, "coach-a", key);
    expect(sealed).not.toContain("secret-key-value");
    expect(openAccount(sealed, "coach-a", key)).toEqual(account);
  });

  it("fails to open for another coach, with another key, or when tampered", () => {
    const sealed = sealAccount(account, "coach-a", key);
    expect(() => openAccount(sealed, "coach-b", key)).toThrow();
    expect(() => openAccount(sealed, "coach-a", Buffer.alloc(32, 8).toString("base64"))).toThrow();
    const parts = sealed.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    expect(() => openAccount(parts.join("."), "coach-a", key)).toThrow();
    expect(() => sealAccount(account, "coach-a", "short")).toThrow(/32 bytes/);
  });
});
