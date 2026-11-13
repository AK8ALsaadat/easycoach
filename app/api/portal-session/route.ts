import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hash, localMode, readableError, rpc } from "@/lib/server";
import { bearerProof, sessionCookieName } from "@/lib/portal-credentials";
import { portalExchangeRetryAfter } from "@/lib/portal-exchange-limit";
const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(process.env.APP_URL ?? request.url).origin)
    return NextResponse.json({ ok: false, error: "مصدر غير مسموح" }, { status: 403, headers: privateHeaders });
  try {
    const retryAfter = await portalExchangeRetryAfter(request);
    if (retryAfter > 0)
      return NextResponse.json({ ok: false, error: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة" }, { status: 429, headers: { ...privateHeaders, "Retry-After": String(retryAfter) } });
  } catch {
    return NextResponse.json({ ok: false, error: "تعذر فتح الرابط الآن. أعد المحاولة بعد قليل" }, { status: 503, headers: { ...privateHeaders, "Retry-After": "30" } });
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error("الرابط غير مكتمل");
    let length = 0; const chunks: Uint8Array[] = [];
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 512) { await reader.cancel(); throw Error("طلب غير صالح"); } chunks.push(value); }
    const { id, token } = z.object({ id: z.string().uuid(), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const session = randomBytes(32).toString("hex"), key = hash(token), proof = bearerProof(token);
    const valid = await rpc<boolean>("bearer_portal_exchange", { portal_id: id, token_hash: key, proof, session_hash: hash(session) }, true);
    if (!valid) return NextResponse.json({ ok: false, error: "الرابط منتهي أو غير صالح. اطلب رابطًا جديدًا من مدربك" }, { status: 403, headers: privateHeaders });
    const response = NextResponse.json({ ok: true, url: "/trainee/" + id }, { headers: privateHeaders });
    const options = { httpOnly: true, secure: !localMode(), sameSite: "strict" as const, path: "/", maxAge: 7 * 86400 };
    response.cookies.set(sessionCookieName(id), session, options);
    response.cookies.set("ec_portal_" + key.slice(0, 12), proof, options);
    return response;
  } catch (error) { return NextResponse.json({ ok: false, error: readableError(error) }, { status: 400, headers: privateHeaders }); }
}
