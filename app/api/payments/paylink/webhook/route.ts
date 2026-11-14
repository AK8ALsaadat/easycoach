import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { verifyPlatformPayment } from "@/lib/platform/paylink";

const Event = z.object({ transactionNo: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^[A-Za-z0-9-]{1,64}$/)), merchantOrderNumber: z.string().max(80).optional() });
export async function POST(request: Request) {
  const secret = process.env.PAYLINK_WEBHOOK_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-webhook-secret") ?? "";
  const a = Buffer.from(supplied), b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response(null, { status: 401 });
  const raw = await request.text();
  if (raw.length > 20000) return new Response(null, { status: 413 });
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  const parsed = Event.safeParse(json);
  if (!parsed.success) return new Response(null, { status: 400 });
  try {
    const result = await verifyPlatformPayment({ transactionNo: parsed.data.transactionNo, orderNumber: parsed.data.merchantOrderNumber });
    return new Response(null, { status: result.state === "error" ? 503 : 200 });
  } catch { return new Response(null, { status: 503 }); }
}
