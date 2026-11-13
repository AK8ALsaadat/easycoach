import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { actor } from "@/lib/server";
import { PaylinkService, paylinkLog } from "@/lib/paylink/service";

const Body = z
  .object({
    subscription_id: z.string().uuid(),
    mobile: z.string().max(20).optional(),
  })
  .strict();

const messages = {
  not_found: "الاشتراك غير متاح لحسابك.",
  not_enabled: "مدربك ما فعّل الدفع الإلكتروني بعد. تواصل معه للدفع.",
  paid: "اشتراكك مدفوع بالكامل.",
  below_minimum: "المبلغ المتبقي أقل من 5 ريال، والدفع الإلكتروني يبدأ من 5 ريال. تواصل مع مدربك.",
  rate_limited: "أنشأت فواتير كثيرة خلال ساعة. انتظر قليلًا وحاول مرة ثانية.",
  unavailable: "تعذّر إنشاء رابط الدفع الآن. حاول بعد دقائق.",
} as const;

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Same-origin fetches may omit it; the session cookie is SameSite=Lax.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Trainee only: creates (or reuses) a Paylink invoice for what is still owed on their subscription. */
export async function POST(request: NextRequest) {
  // Same-origin only: a cross-site page must not start a payment for a signed-in trainee.
  // Compared with the Host the browser actually used (nextUrl can differ behind a proxy).
  if (!sameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const user = await actor();
  if (!user) return NextResponse.json({ ok: false, message: "يلزم تسجيل الدخول" }, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, message: "طلب غير صالح" }, { status: 400 });
  try {
    const result = await PaylinkService.checkout({ userId: user.id, subscriptionId: body.data.subscription_id, mobile: body.data.mobile });
    if (result.kind === "redirect") return NextResponse.json({ ok: true, url: result.url });
    if (result.kind === "needs_mobile") return NextResponse.json({ ok: false, needs_mobile: true, message: "اكتب رقم جوالك بصيغة 05XXXXXXXX لإكمال الدفع." });
    return NextResponse.json({ ok: false, code: result.code, message: messages[result.code] }, { status: result.code === "not_found" ? 404 : result.code === "rate_limited" ? 429 : 409 });
  } catch {
    paylinkLog("paylink.checkout.error");
    return NextResponse.json({ ok: false, message: messages.unavailable }, { status: 503 });
  }
}
