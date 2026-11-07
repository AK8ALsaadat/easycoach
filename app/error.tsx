"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto mt-20 max-w-lg p-6">
      <div className="card p-8">
        <h1>ما اكتملت العملية</h1>
        <p className="my-4 text-muted">
          قد يكون الاتصال أو إعداد قاعدة البيانات. بياناتك المحفوظة باقية؛ أعد
          المحاولة.
        </p>
        <button className="btn" onClick={reset}>
          حاول مرة ثانية
        </button>
        <Link href="/login" className="btn-secondary ms-3">
          الدخول
        </Link>
      </div>
    </main>
  );
}
