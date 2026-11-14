"use client";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * The page-level fallback. It no longer blames the database for everything: the
 * cause is usually a failed server read, so the text says what we know, what is
 * safe (saved data), and what to try — and shows the digest so a report can be
 * matched to the server log line.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto mt-20 max-w-lg p-6">
      <div className="card p-8">
        <h1 className="flex items-center gap-2">
          <AlertTriangle size={20} />
          ما اكتمل تحميل الصفحة
        </h1>
        <p className="my-4 leading-7 text-muted">
          تعذّر جلب بياناتك من الخادم الآن. كل ما حفظته باقٍ كما هو ولم يتأثر. أعد
          المحاولة، وإذا تكرر الأمر سجّل الخروج والدخول من جديد أو تواصل مع الدعم.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={reset}>
            حاول مرة ثانية
          </button>
          <Link href="/login" className="btn-secondary">
            الدخول
          </Link>
        </div>
        {error.digest && (
          <p className="mt-5 text-xs text-muted">
            رمز العطل للدعم: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </main>
  );
}
