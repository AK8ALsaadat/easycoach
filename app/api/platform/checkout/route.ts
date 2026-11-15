import { billingEnabled } from "@/lib/billing-mode";
import { actor, rpc } from "@/lib/server";
import { checkoutPlatform } from "@/lib/platform/paylink";
import { paymentReadiness, paymentReadinessMessage } from "@/lib/platform/payment-config";
import { billingCall } from "@/lib/platform/billing-store";
import { normalizeSaudiMobile } from "@/lib/paylink/flow";
import { POLICY_VERSION } from "@/lib/legal";
import { z } from "zod";

const Body = z.object({ plan: z.enum(["starter", "pro", "business"]), total: z.number().int().positive(), mobile: z.string().max(24), terms: z.literal(POLICY_VERSION), coupon: z.string().trim().min(1).max(32).optional(), transitionLegacy: z.boolean().optional() }).strict();
const messages: Record<string, string> = {
  period_running: "فترتك الحالية مستمرة. يمكنك الدفع بعد انتهائها.",
  quote_changed: "تغيّر السعر. حدّث الصفحة وراجع الإجمالي قبل الدفع.",
  pending_invoice: "لديك فاتورة قائمة بسعر أو باقة مختلفة. أكملها أو انتظر إلغاءها لدى Paylink قبل تغيير الكوبون.",
  coupon_invalid: "الكوبون غير صالح أو انتهت صلاحيته. أزله أو طبّق كوبونًا آخر.",
  legacy_consent_required: "وافق على الانتقال من حسابك السابق إلى الباقة المختارة قبل الدفع.",
  payment_pending: "طلب الدفع قيد التحقق. لا تنشئ دفعة أخرى؛ راجع فواتيرك أو تواصل مع دعم المنصة.",
  invoice_canceled: "أُلغيت الفاتورة السابقة. اضغط مجددًا لإنشاء فاتورة جديدة.",
  payment_review: "دفعتك قيد المراجعة لدى المنصة. لا تدفع مرة أخرى.",
  owner_required: "الدفع مخصص لمالك حساب المدرب فقط.",
  rate_limited: "انتظر قليلًا قبل إنشاء فاتورة أخرى.",
  provider_not_ready: "التفعيل معطل لحين تأكيد جاهزية وسيلة الدفع",
  tax_not_configured: "لم تُحدد إعدادات التسجيل الضريبي للمشغّل",
  subscription_cancelled: "اشتراكك ملغى. لا يُنشأ طلب دفع جديد بعد الإلغاء.",
};
export async function POST(request: Request) {
  if (!billingEnabled()) return new Response(null, { status: 404 });
  const user = await actor();
  if (!user) return Response.json({ error: "يلزم تسجيل الدخول" }, { status: 401 });
  const origin = request.headers.get("origin"), host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try { if (!origin || new URL(origin).host !== host) return Response.json({ error: "طلب غير مسموح" }, { status: 403 }); }
  catch { return Response.json({ error: "طلب غير مسموح" }, { status: 403 }); }
  const state = await rpc<{ mode: string }>("ec_subscription").catch(() => null);
  if (!state) return Response.json({ error: messages.owner_required }, { status: 403 });
  const readiness = await paymentReadiness();
  if (!readiness.ready) return Response.json({ error: paymentReadinessMessage(readiness), code: readiness.blocked }, { status: 503 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "راجع الباقة والإجمالي ووافق على الشروط قبل الدفع." }, { status: 400 });
  if (state.mode === "legacy" && !body.data.transitionLegacy) return Response.json({ error: messages.legacy_consent_required, code: "legacy_consent_required" }, { status: 409 });
  const mobile = normalizeSaudiMobile(body.data.mobile);
  if (!mobile) return Response.json({ error: "أدخل رقم جوالك بصيغة 05XXXXXXXX." }, { status: 400 });
  try {
    await billingCall("ec_billing_contact", { owner: user.id, mobile, customer_name: user.name || user.email });
    const url = await checkoutPlatform({ owner: user.id, plan: body.data.plan, total: body.data.total, email: user.email, coupon: body.data.coupon, transitionLegacy: body.data.transitionLegacy });
    return Response.json({ ok: true, url });
  } catch (error) {
    const currentReadiness = await paymentReadiness().catch(() => null);
    if (currentReadiness && !currentReadiness.ready) return Response.json({ error: paymentReadinessMessage(currentReadiness), code: currentReadiness.blocked }, { status: 503 });
    const code = error instanceof Error ? error.message : "";
    const known = messages[code];
    return Response.json({ error: known ?? "تعذّر فتح الدفع. راجع فواتيرك قبل إعادة المحاولة؛ إذا ظهر خصم فلا تدفع مرة أخرى.", code: known ? code : "billing_unavailable" }, { status: known ? 409 : 503 });
  }
}
