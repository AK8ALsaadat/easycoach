"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function AccessLink({ portalId }: { portalId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const credential = useRef<string | null>(null);
  const exchange = useRef<Promise<{ url: string }> | null>(null);
  useEffect(() => {
    let active = true;
    if (credential.current === null) credential.current = window.location.hash.slice(1);
    const token = credential.current;
    // Remove the bearer from history before any network request or third-party navigation.
    window.history.replaceState(null, "", window.location.pathname);
    if (!/^[a-f0-9]{64}$/.test(token)) {
      router.replace("/trainee/" + portalId);
      return;
    }
    exchange.current ??= fetch("/api/portal-session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: portalId, token }) })
      .then(async response => { const result = await response.json(); if (!result.ok) throw Error(result.error); return result; });
    void exchange.current.then(result => { if (active) router.replace(result.url); })
      .catch(error => { if (active) { exchange.current = null; setError(error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذر الاتصال. أعد المحاولة أو افتح الرابط الأصلي من جديد"); } });
    return () => { active = false; };
  }, [portalId, router, attempt]);
  return <><p role={error ? "alert" : "status"} className="mt-5 text-sm leading-8">{error || "جارٍ فتح بوابتك… لا يلزم إنشاء حساب."}</p>{error && <button className="btn mt-4" onClick={() => { setError(""); setAttempt(value => value + 1); }}>إعادة المحاولة</button>}</>;
}
