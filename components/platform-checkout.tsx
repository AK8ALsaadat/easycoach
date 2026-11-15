"use client";
import { useState } from "react";
import Link from "next/link";
import { POLICY_VERSION } from "@/lib/legal";
import type { PaidPlan } from "@/lib/platform/plans";

export function PlatformCheckout({ plan, total, renewal = false }: { plan: PaidPlan; total: number; renewal?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/payments/paylink/create-invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, total, mobile: form.get("mobile"), terms: POLICY_VERSION }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.url) { setError(result?.error || "تعذّر فتح صفحة الدفع. راجع فواتيرك قبل المحاولة مجددًا."); setBusy(false); return; }
      window.location.assign(result.url);
    } catch { setError("تعذّر الاتصال بخدمة الدفع. راجع فواتيرك، ولا تدفع مرة أخرى إذا ظهر خصم."); setBusy(false); }
  }}>
    <label className="block">رقم جوالك لفاتورة اشتراك المنصة<input className="field mt-2 w-full" name="mobile" type="tel" inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX" required maxLength={24} disabled={busy} dir="ltr" /></label>
    <label className="policy-acceptance"><input type="checkbox" required disabled={busy} /><span>أوافق على <Link href="/terms" target="_blank" rel="noopener">الشروط والأحكام</Link> و<Link href="/privacy" target="_blank" rel="noopener">سياسة الخصوصية</Link> وشراء 30 يومًا من EasyCoach بالمبلغ الموضح، دون تجديد تلقائي.</span></label>
    {error && <p role="alert" className="plans-alert">{error}</p>}
    <button className="btn w-full" disabled={busy} aria-busy={busy} type="submit">{busy ? "جارٍ فتح الدفع الآمن…" : renewal ? "ادفع لتجديد الاشتراك" : "ادفع الفترة الأولى"}</button>
    <p className="plan-note">تُدفع قيمة اشتراكك لمشغّل EasyCoach. أدخل بيانات بطاقتك في صفحة Paylink الآمنة فقط.</p>
  </form>;
}
