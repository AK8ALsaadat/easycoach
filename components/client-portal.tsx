"use client";
import { useState, useEffect, useCallback } from "react";
import { LockKeyhole, RefreshCw, Check } from "lucide-react";
import Link from "next/link";
import { accessPortal } from "@/app/studio-actions";
import type { PortalData } from "@/lib/model";
import { ProgramView } from "./program-view";
import { WeightPanel } from "./weight-panel";
import { Brand } from "./brand";
export function ClientPortal({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null),
    [pin, setPin] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [updated, setUpdated] = useState("");
  const refresh = useCallback(async () => {
    const r = await accessPortal(token);
    if (r.ok && r.data) {
      setData(r.data);
      setUpdated(
        new Date().toLocaleTimeString("ar-SA", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } else {
      setData(null);
      setError(r.error ?? "تعذر تحديث الرابط. حاول الدخول مرة ثانية");
    }
    return r;
  }, [token]);
  useEffect(() => {
    let active = true;
    void accessPortal(token).then((r) => {
      if (active && r.ok && r.data) setData(r.data);
    });
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, [data, refresh]);
  if (!data)
    return (
      <main className="portal-gate">
        <Brand />
        <form
          className="card mx-auto my-auto w-full max-w-sm p-7"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const r = await accessPortal(token, pin);
            if (r.ok && r.data) {
              setData(r.data);
              setPin("");
            } else setError(r.error ?? "تعذر فتح الرابط");
            setBusy(false);
          }}
        >
          <span className="portal-icon mb-5">
            <LockKeyhole size={24} />
          </span>
          <p className="eyebrow">بوابة المتدرب</p>
          <h1 className="mt-3">جاهز لحصتك؟</h1>
          <p className="my-4 text-sm text-muted">
            أدخل رمز الدخول اللي أرسله لك مدربك.
          </p>
          <input
            aria-label="رمز دخول العميل"
            className="field text-center font-mono text-2xl tracking-[.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            required
          />
          <button className="btn mt-4 w-full" disabled={busy}>
            {busy ? "نفتح جدولك…" : "افتح جدولي"}
          </button>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </form>
      </main>
    );
  return (
    <div className="client-portal">
      <header className="portal-topbar">
        <Brand />
        <span className="text-xs text-white/60">مع المدرب {data.coach}</span>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="portal-welcome">
          <div>
            <p className="eyebrow">خطوة جديدة نحو هدفك</p>
            <h1>
              أهلًا {data.name.split(" ")[0]}،<br />
              كل جولة تفرق.
            </h1>
            <p className="mt-3 text-sm text-white/60">
              {data.goal?.goal ?? "برنامجك التدريبي"}
              {data.goal?.focus ? " / " + data.goal.focus : ""}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3">
            <button
              className="btn-secondary"
              onClick={async () => {
                setBusy(true);
                const r = await refresh();
                if (!r.ok) setError(r.error ?? "تعذر التحديث");
                setBusy(false);
              }}
            >
              <RefreshCw size={15} className={busy ? "animate-spin" : ""} />
              تحديث الجدول
            </button>
            <span className="flex items-center gap-1 text-xs text-white/50">
              <Check size={12} />
              يتحدث تلقائيًا {updated ? "· " + updated : ""}
            </span>
          </div>
        </div>
        {error ? (
          <p role="alert" className="my-4 text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
          <ProgramView
            program={data.program ?? undefined}
            portalHash={data.portalHash}
          />
          <aside className="space-y-5">
            <WeightPanel
              entries={data.weights}
              target={data.goal?.target_weight}
              onSave={async (day, weight) => {
                const r = await accessPortal(token, undefined, {
                  entry_date: day,
                  weight,
                });
                if (r.ok && r.data) setData(r.data);
                else return r.error;
              }}
              onDelete={async (day) => {
                const r = await accessPortal(token, undefined, {
                  entry_date: day,
                  remove: true,
                });
                if (r.ok && r.data) setData(r.data);
                else return r.error;
              }}
            />
            <div className="border-t p-4 text-xs leading-7 text-muted">
              سجّل الوزن وقت ما يناسبك. تصحيح نفس اليوم يستبدل التسجيل السابق.
              وزن يوم واحد ما يختصر تقدمك.
            </div>
          </aside>
        </div>
        <footer className="mt-8 border-t py-5 text-xs text-muted">
          إيزي كوتش · <Link href="/privacy">الخصوصية</Link>
        </footer>
      </main>
    </div>
  );
}
