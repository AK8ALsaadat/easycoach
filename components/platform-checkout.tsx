"use client";
import { useState } from "react";
import Link from "next/link";
import { POLICY_VERSION } from "@/lib/legal";
import type { PaidPlan } from "@/lib/platform/plans";

export function PlatformCheckout({ plan, total }: { plan: PaidPlan; total: number }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/platform/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, total, mobile: form.get("mobile"), terms: POLICY_VERSION }) });
      const result = await response.json();
      if (!response.ok || !result.url) throw Error(result.error || "تعذّر فتح صفحة الدفع.");
      window.location.assign(result.url);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر الاتصال. راجع فواتيرك قبل المحاولة مجددًا."); setBusy(false); }
  }}>
    <label className="block">رقم جوالك لفاتورة اشتراك المنصة<input className="field mt-2 w-full" name="mobile" type="tel" inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX" required maxLength={24} disabled={busy} dir="ltr" /></label>
    <label className="policy-acceptance"><input type="checkbox" required disabled={busy} /><span>أوافق على <Link href="/terms" target="_blank" rel="noopener">الشروط والأحكام</Link> و<Link href="/privacy" target="_blank" rel="noopener">سياسة الخصوصية</Link> وشراء شهر واحد من EasyCoach بالمبلغ الموضح، دون تجديد تلقائي.</span></label>
    {error && <p role="alert" className="plans-alert">{error}</p>}
    <button className="btn w-full" disabled={busy} aria-busy={busy} type="submit">{busy ? "جارٍ فتح الدفع الآمن…" : "اشترك وادفع عبر Paylink"}</button>
    <p className="plan-note">تُدفع قيمة اشتراكك لمشغّل EasyCoach. أدخل بيانات بطاقتك في صفحة Paylink الآمنة فقط.</p>
  </form>;
}
