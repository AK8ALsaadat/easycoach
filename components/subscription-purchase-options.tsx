import Link from "next/link";
import { PlatformCheckout } from "@/components/platform-checkout";
import { TrialStartForm } from "@/components/trial-start-form";
import { paymentReadinessMessage, type PaymentReadiness } from "@/lib/platform/payment-config";
import type { PaidPlan } from "@/lib/platform/plans";

export function SubscriptionPurchaseOptions({ plan, total, trialAvailable, trialDays, canPay, renewal = false, transitionLegacy = false, readiness }: {
  plan: PaidPlan; total: number | null; trialAvailable: boolean; trialDays: number; canPay: boolean; renewal?: boolean; transitionLegacy?: boolean; readiness: PaymentReadiness;
}) {
  if (!readiness.ready || total === null) return <div role="status" className="plans-alert space-y-2">
    {!readiness.taxReady || total === null ? <p>لم تُحدد إعدادات التسجيل الضريبي للمشغّل</p> : null}
    {!readiness.verified && <p>Paylink غير معتمد للتحصيل بعد. التفعيل معطل لحين تأكيد جاهزية وسيلة الدفع</p>}
    {!readiness.enabled && <p>الدفع معطل حاليًا من إعدادات المنصة</p>}
    {readiness.taxReady && readiness.enabled && readiness.reason === "credentials_missing" && <p>{paymentReadinessMessage(readiness)}</p>}
  </div>;
  return <div className="space-y-6">
    {trialAvailable && <section><h2 className="mb-4">ابدأ التجربة</h2><TrialStartForm plan={plan} days={trialDays} /></section>}
    {canPay && <section><h2 className="mb-4">{trialAvailable ? "أو اشترك مباشرة دون تجربة" : "سداد فترة الاشتراك"}</h2><PlatformCheckout plan={plan} total={total} renewal={renewal} transitionLegacy={transitionLegacy} /></section>}
    {!trialAvailable && !canPay && <Link href="/subscription" className="btn w-full">إدارة اشتراكي الحالي</Link>}
  </div>;
}
