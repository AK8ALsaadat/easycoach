import { billingEnabled } from "@/lib/billing-mode";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { logPaymentEvent, requestRef, verifyPlatformPayment } from "@/lib/platform/paylink";

const Event = z.object({ transactionNo: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^[A-Za-z0-9-]{1,64}$/)), merchantOrderNumber: z.string().max(80).optional() });
type ErrorCode = "unauthorized" | "not_configured" | "payload_too_large" | "invalid_json" | "invalid_payload" | "verification_unavailable";

/** Paylink requires a JSON body on every response. Error codes are fixed strings: no internal detail. */
function reply(status: number, error?: ErrorCode) {
  return Response.json(error ? { success: false, error } : { success: true }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!billingEnabled()) return new Response(null, { status: 404 });
  try {
    const secret = process.env.PAYLINK_WEBHOOK_SECRET;
    if (!secret) return reply(503, "not_configured");
    const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-webhook-secret") ?? "";
    const a = Buffer.from(supplied), b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      // logPaymentEvent never throws; a missing log table cannot change this response.
      await logPaymentEvent("webhook", "unauthorized", { requestId: requestRef(request.headers) });
      return reply(401, "unauthorized");
    }
    const raw = await request.text();
    if (raw.length > 20000) return reply(413, "payload_too_large");
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return reply(400, "invalid_json"); }
    const parsed = Event.safeParse(json);
    if (!parsed.success) return reply(400, "invalid_payload");
    const result = await verifyPlatformPayment({ transactionNo: parsed.data.transactionNo, orderNumber: parsed.data.merchantOrderNumber }, { source: "webhook", requestId: requestRef(request.headers) });
    // paid, pending, failed, canceled, review and unknown are all acknowledged; only a provider/verification error asks Paylink to retry.
    return result.state === "error" ? reply(503, "verification_unavailable") : reply(200);
  } catch {
    return reply(503, "verification_unavailable");
  }
}
