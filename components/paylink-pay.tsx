"use client";
import { useState } from "react";
import { CreditCard } from "lucide-react";
import { useLocale } from "./locale-provider";
import type { Payment, Subscription } from "@/lib/model";

/** What is still owed on each current or upcoming subscription. Past ones are settled with the coach. */
export function payableSubscriptions(subscriptions: Subscription[], payments: Pick<Payment, "subscription_id" | "amount">[], today: string) {
  return subscriptions
    .filter((s) => s.end_date >= today)
    .map((s) => {
      const paid = payments.filter((p) => p.subscription_id === s.id).reduce((sum, p) => sum + Number(p.amount), 0);
      return { subscription: s, outstanding: Math.round((Number(s.price) - paid) * 100) / 100 };
    })
    .filter((row) => row.outstanding > 0)
    .sort((a, b) => a.subscription.start_date.localeCompare(b.subscription.start_date));
}

export function PaylinkPay({ subscriptions, payments, today }: { subscriptions: Subscription[]; payments: Payment[]; today: string }) {
  const { t: tr } = useLocale();
  const rows = payableSubscriptions(subscriptions, payments, today);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string } | null>(null);
  const [askMobile, setAskMobile] = useState<string | null>(null);
  const [mobile, setMobile] = useState("");

  // Nothing owed is a status too: silence read as "payment is not available".
  if (!rows.length)
    return subscriptions.some((item) => item.end_date >= today) ? (
      <p className="mt-5 rounded-xl bg-canvas p-4 text-sm" data-testid="paylink-settled">
        {tr("اشتراكك مدفوع بالكامل. شكرًا لك ✓")}
      </p>
    ) : null;

  async function pay(subscriptionId: string) {
    setBusy(subscriptionId);
    setMessage(null);
    try {
      const response = await fetch("/api/payments/paylink/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: subscriptionId, ...(askMobile === subscriptionId && mobile ? { mobile } : {}) }),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; url?: string; needs_mobile?: boolean; message?: string };
      if (body.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      if (body.needs_mobile) setAskMobile(subscriptionId);
      setMessage({ id: subscriptionId, text: body.message ?? "تعذّر إنشاء رابط الدفع الآن. حاول بعد دقائق." });
    } catch {
      setMessage({ id: subscriptionId, text: "تعذّر الاتصال. تأكد من الإنترنت وحاول مرة ثانية." });
    }
    setBusy(null);
  }

  return (
    <div className="mt-5 space-y-3" data-testid="paylink-pay">
      {rows.map(({ subscription, outstanding }) => (
        <div key={subscription.id} className="rounded-xl bg-canvas p-4">
          <p className="text-sm font-semibold">{subscription.start_date > today ? tr("تجديد: {0}", subscription.name) : subscription.name}</p>
          <p className="mt-1 text-xs text-muted">
            {tr("المتبقي")}: <bdi dir="ltr">{outstanding.toFixed(2)}</bdi> {tr("ر.س")}
          </p>
          {askMobile === subscription.id ? (
            <label className="mt-3 block text-xs">
              {tr("رقم الجوال")}
              <input
                className="field mt-1"
                inputMode="tel"
                dir="ltr"
                placeholder="05XXXXXXXX"
                maxLength={14}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />
            </label>
          ) : null}
          <button type="button" className="btn mt-3 w-full justify-center" disabled={busy !== null} onClick={() => void pay(subscription.id)}>
            <CreditCard size={16} aria-hidden="true" />
            {busy === subscription.id ? tr("جاري تجهيز الدفع...") : tr("ادفع الآن")}
          </button>
          {message?.id === subscription.id ? (
            <p className="mt-2 text-xs text-danger" role="alert">
              {tr(message.text)}
            </p>
          ) : null}
        </div>
      ))}
      <p className="text-xs text-muted">{tr("الدفع عبر Paylink، والمبلغ يروح لحساب مدربك مباشرة.")}</p>
    </div>
  );
}
