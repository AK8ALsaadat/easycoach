"use client";
import { useState } from "react";
import Link from "next/link";
import { POLICY_VERSION } from "@/lib/legal";
import type { PaidPlan } from "@/lib/platform/plans";
import { sar } from "@/lib/platform/plans";
import type { CouponQuote } from "@/lib/platform/coupons";

export function PlatformCheckout({ plan, total, renewal = false }: { plan: PaidPlan; total: number; renewal?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [coupon, setCoupon] = useState(""), [couponQuote, setCouponQuote] = useState<CouponQuote | null>(null);
  const [applying, setApplying] = useState(false), [couponError, setCouponError] = useState("");
  const payable = couponQuote?.total_halalas ?? total;
  const unapplied = Boolean(coupon.trim()) && !couponQuote;
  async function applyCoupon() {
    if (busy || applying || !coupon.trim()) return;
    setApplying(true); setCouponError(""); setError("");
    try {
      const response = await fetch("/api/platform/coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, coupon: coupon.trim() }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.quote) { setCouponQuote(null); setCouponError(result?.error || "تعذّر تطبيق الكوبون."); return; }
      setCouponQuote(result.quote); setCoupon(result.quote.coupon_code);
    } catch { setCouponQuote(null); setCouponError("تعذّر الاتصال. حاول تطبيق الكوبون مجددًا."); }
    finally { setApplying(false); }
  }
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault();
    if (busy || applying || unapplied) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/payments/paylink/create-invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, total: payable, mobile: form.get("mobile"), terms: POLICY_VERSION, ...(couponQuote ? { coupon: couponQuote.coupon_code } : {}) }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.url) { setError(result?.error || "تعذّر فتح صفحة الدفع. راجع فواتيرك قبل المحاولة مجددًا."); setBusy(false); return; }
      window.location.assign(result.url);
    } catch { setError("تعذّر الاتصال بخدمة الدفع. راجع فواتيرك، ولا تدفع مرة أخرى إذا ظهر خصم."); setBusy(false); }
  }}>
    <div className="space-y-2">
      <label className="block" htmlFor={`coupon-${plan}`}>كوبون الخصم</label>
      <div className="flex flex-wrap gap-2">
        <input id={`coupon-${plan}`} className="field min-w-0 flex-1" name="coupon" placeholder="أدخل الكوبون" value={coupon} maxLength={32} autoComplete="off" autoCapitalize="none" spellCheck={false} dir="ltr" disabled={busy || applying} aria-invalid={Boolean(couponError)} onChange={event => { setCoupon(event.target.value); setCouponQuote(null); setCouponError(""); setError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void applyCoupon(); } }} />
        <button type="button" className="btn-secondary" disabled={busy || applying || !coupon.trim() || Boolean(couponQuote)} onClick={applyCoupon}>{applying ? "جارٍ التطبيق…" : "تطبيق الكوبون"}</button>
        {coupon.trim() && <button type="button" className="btn-secondary" disabled={busy || applying} onClick={() => { setCoupon(""); setCouponQuote(null); setCouponError(""); setError(""); }}>إزالة</button>}
      </div>
      {couponError && <p role="alert" className="plans-alert">{couponError}</p>}
      {unapplied && !couponError && <p className="plan-note">اضغط «تطبيق الكوبون» للتحقق من الخصم قبل الدفع.</p>}
    </div>
    <div className="rounded-2xl border border-current/10 p-4 space-y-2" aria-live="polite" aria-atomic="true">
      {couponQuote && <>
        <p>تم تطبيق <b dir="ltr">{couponQuote.coupon_code}</b> — خصم {couponQuote.coupon_percent}%</p>
        <p>قبل الكوبون: <del>{sar(couponQuote.regular_total_halalas)} ريال</del></p>
        <p>قيمة الخصم: {sar(couponQuote.coupon_discount_halalas)} ريال</p>
        {couponQuote.vat_halalas > 0 && <p>الضريبة ضمن الإجمالي: {sar(couponQuote.vat_halalas)} ريال</p>}
        {couponQuote.minimum_applied && <p className="plan-note">الحد الأدنى للدفع عبر Paylink هو {sar(couponQuote.minimum_total_halalas)} ريالات؛ تم ضبط الإجمالي على هذا الحد بعد الخصم.</p>}
        <p className="plan-note">الكوبون لهذه الفاتورة فقط. لا يُطبّق تلقائيًا على التجديد القادم.</p>
      </>}
      <p><strong>الإجمالي النهائي للدفع: {sar(payable)} ريال</strong></p>
    </div>
    <label className="block">رقم جوالك لفاتورة اشتراك المنصة<input className="field mt-2 w-full" name="mobile" type="tel" inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX" required maxLength={24} disabled={busy} dir="ltr" /></label>
    <label className="policy-acceptance"><input type="checkbox" required disabled={busy} /><span>أوافق على <Link href="/terms" target="_blank" rel="noopener">الشروط والأحكام</Link> و<Link href="/privacy" target="_blank" rel="noopener">سياسة الخصوصية</Link> وشراء 30 يومًا من EasyCoach بالمبلغ الموضح، دون تجديد تلقائي.</span></label>
    {error && <p role="alert" className="plans-alert">{error}</p>}
    <button className="btn w-full" disabled={busy || applying || unapplied} aria-busy={busy} type="submit">{busy ? "جارٍ فتح الدفع الآمن…" : renewal ? "ادفع لتجديد الاشتراك" : "ادفع الفترة الأولى"}</button>
    <p className="plan-note">تُدفع قيمة اشتراكك لمشغّل EasyCoach. أدخل بيانات بطاقتك في صفحة Paylink الآمنة فقط.</p>
  </form>;
}
