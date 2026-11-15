"use client";
import "./global-error.css";
import Link from "next/link";

/** Independent of providers and root-layout data/font loading. Next 16.4 uses retry. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="ar" dir="rtl"><head><title>تعذر فتح الصفحة | إيزي كوتش</title><meta name="robots" content="noindex,nofollow" /></head><body className="fatal-page">
    <main className="fatal-card" role="alert">
      <h1>تعذر فتح الصفحة الآن</h1>
      <p>أعد المحاولة بعد قليل. إذا استمر التعطل، تواصل مع الدعم واذكر رمز العطل إن ظهر.</p>
      <div className="fatal-actions"><button type="button" onClick={() => retry()}>إعادة المحاولة</button><Link href="/">الصفحة الرئيسية</Link></div>
      {error?.digest && <p>رمز العطل: <bdi dir="ltr">{error.digest}</bdi></p>}
    </main>
  </body></html>;
}
