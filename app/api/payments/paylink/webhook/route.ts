import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { accountFor, PaylinkService, paylinkLog } from "@/lib/paylink/service";
import { paylinkStore } from "@/lib/paylink/store";

/**
 * Paylink "Payment Webhook" (v2 body: amount, transactionNo, merchantOrderNumber, orderStatus, ...).
 * The body is never trusted: it only names a transaction, and getInvoice decides what happened.
 * Settling is idempotent (one payment row per transaction), so Paylink's retries are harmless.
 * 200 = handled or nothing to do. 500/503 = Paylink retries (up to 10 times).
 */
const Event = z
  .object({
    transactionNo: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^[A-Za-z0-9-]{1,64}$/)),
    merchantOrderNumber: z.union([z.string(), z.number()]).transform(String).optional(),
    orderStatus: z.string().max(40).optional(),
  })
  .passthrough();

const status = (code: number) => new NextResponse(null, { status: code });

function secretMatches(request: NextRequest, expected: string): boolean {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-webhook-secret") ?? "";
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 20_000) return status(413);
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    return status(400);
  }
  const event = Event.safeParse(json);
  if (!event.success) return status(400);
  const transactionNo = event.data.transactionNo;

  let stored;
  try {
    stored = await paylinkStore.invoiceLookup(transactionNo, null);
    if (!stored && event.data.merchantOrderNumber && /^EC-[A-Z0-9-]{8,60}$/.test(event.data.merchantOrderNumber))
      stored = await paylinkStore.invoiceLookup(null, event.data.merchantOrderNumber);
  } catch {
    paylinkLog("paylink.webhook.store_unavailable");
    return status(503);
  }
  // Not ours (or another system's invoice on the same merchant account): acknowledge and stop.
  if (!stored) return status(200);

  const account = await accountFor(stored.coach_id).catch(() => null);
  if (account?.webhookSecret && !secretMatches(request, account.webhookSecret)) {
    paylinkLog("paylink.webhook.bad_secret", { order: stored.order_number });
    return status(401);
  }

  const result = await PaylinkService.verify({ transactionNo, orderNumber: event.data.merchantOrderNumber });
  if (result.state === "error") return status(500);
  return status(200);
}
