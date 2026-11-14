import { actor, rpc } from "@/lib/server";
import { checkoutPlatform, platformMerchant } from "@/lib/platform/paylink";
import { normalizeSaudiMobile } from "@/lib/paylink/flow";
import { POLICY_VERSION } from "@/lib/legal";
import { z } from "zod";

const Body = z.object({ plan: z.enum(["starter", "pro", "business"]), total: z.number().int().positive(), mobile: z.string().max(24), terms: z.literal(POLICY_VERSION) }).strict();
const messages: Record<string, string> = {
  period_running: "فترتك الحالية مستمرة. يمكنك الدفع بعد انتهائها.",
  quote_changed: "تغيّر السعر. حدّث الصفحة وراجع الإجمالي قبل الدفع.",
  pending_invoice: "لديك فاتورة قائمة لباقة أخرى. أكملها أو انتظر إلغاءها لدى Paylink.",
  payment_pending: "طلب الدفع قيد التحقق. لا تنشئ دفعة أخرى؛ راجع فواتيرك أو تواصل مع دعم المنصة.",
  invoice_canceled: "أُلغيت الفاتورة السابقة. اضغط مجددًا لإنشاء فاتورة جديدة.",
  payment_review: "دفعتك قيد المراجعة لدى المنصة. لا تدفع مرة أخرى.",
  owner_required: "الدفع مخصص لمالك حساب المدرب فقط.",
  rate_limited: "انتظر قليلًا قبل إنشاء فاتورة أخرى.",
};
export async function POST(request: Request) {
  const user = await actor();
  if (!user) return Response.json({ error: "يلزم تسجيل الدخول" }, { status: 401 });
  const origin = request.headers.get("origin"), host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try { if (!origin || new URL(origin).host !== host) return Response.json({ error: "طلب غير مسموح" }, { status: 403 }); }
  catch { return Response.json({ error: "طلب غير مسموح" }, { status: 403 }); }
  const state = await rpc("ec_subscription").catch(() => null);
  if (!state) return Response.json({ error: messages.owner_required }, { status: 403 });
  if (!platformMerchant() || !await rpc<boolean>("ec_paylink_ready")) return Response.json({ error: "دفع اشتراك المنصة غير متاح بعد. لم يُنشأ أي طلب دفع.", code: "billing_unavailable" }, { status: 503 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "راجع الباقة والإجمالي ووافق على الشروط قبل الدفع." }, { status: 400 });
  const mobile = normalizeSaudiMobile(body.data.mobile);
  if (!mobile) return Response.json({ error: "أدخل رقم جوالك بصيغة 05XXXXXXXX." }, { status: 400 });
  try {
    const url = await checkoutPlatform({ ...body.data, mobile, email: user.email, name: user.name || user.email });
    return Response.json({ ok: true, url });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const known = messages[code];
    return Response.json({ error: known ?? "تعذّر فتح الدفع. راجع فواتيرك قبل إعادة المحاولة؛ إذا ظهر خصم فلا تدفع مرة أخرى.", code: known ? code : "billing_unavailable" }, { status: known ? 409 : 503 });
  }
}
