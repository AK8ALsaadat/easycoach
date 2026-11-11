"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, X } from "lucide-react";
import { mutate, type Result } from "@/app/actions";
import { riyadhToday, formatDate } from "@/lib/dates";
import { latestSubscription, subscriptionPeriod } from "@/lib/subscription-period";
import type { Client, Subscription } from "@/lib/model";
import { Notice } from "./forms";
import { useLocale } from "./locale-provider";
import { useDialog } from "./use-dialog";

export function SubscriptionRenewal({ client, subscriptions }: { client: Client; subscriptions: Subscription[] }) {
  const { t: tr, language } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState(1);
  const [customEnd, setCustomEnd] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [result, setResult] = useState<Result | null>(null);
  const dialog = useDialog(open, () => { if (!submitting.current) setOpen(false); });
  const previous = latestSubscription(subscriptions, client.id);
  const period = subscriptionPeriod(riyadhToday(), months || 1, previous);
  const end = months ? period.end : customEnd;
  return <>
    <button type="button" className="btn-soft subscription-renewal-trigger" onClick={() => { setResult(null); setMonths(1); setCustomEnd(""); setPrice(previous ? String(previous.price) : ""); setOpen(true); }}><CalendarDays size={16} />{tr(previous ? "تجديد الاشتراك" : "إضافة اشتراك")}</button>
    {result?.ok && <Notice result={result} />}
    {open && <div className="modal-backdrop" onClick={() => { if (!submitting.current) setOpen(false); }}>
      <section className="modal-sheet" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`renew-${client.id}`} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b p-5"><h2 id={`renew-${client.id}`}>{tr(previous ? "تجديد الاشتراك" : "إضافة اشتراك")} — {client.name}</h2><button type="button" className="icon-button" disabled={busy} aria-label={tr("إغلاق")} onClick={() => setOpen(false)}><X size={20} /></button></header>
        <form className="space-y-5 p-6" onSubmit={async e => {
          e.preventDefault();
          if (submitting.current || !end || end < period.start || price === "" || !Number.isFinite(Number(price)) || Number(price) < 0 || Number(price) > 1000000) return;
          submitting.current = true; setBusy(true); setResult(null);
          try {
            const response = await mutate("subscription_create", { client_id: client.id, name: previous?.name ?? tr("اشتراك تدريب"), price: Number(price), start_date: period.start, end_date: end, ...(previous ? { previous_id: previous.id } : {}) });
            setResult(response);
            if (response.ok) { router.refresh(); setOpen(false); }
          } catch { setResult({ ok: false, message: "تعذر الاتصال. لم نتأكد من الحفظ؛ أعد المحاولة بنفس البيانات." }); }
          finally { submitting.current = false; setBusy(false); }
        }}>
          {previous && <p className="text-sm text-muted">{tr("النهاية الحالية")}: {formatDate(previous.end_date, language)}</p>}
          <label className="block">{tr("مدة الاشتراك")}<select className="field mt-2" value={months} disabled={busy} onChange={e => setMonths(Number(e.target.value))}>
            {[[1,"شهر"],[3,"3 أشهر"],[6,"6 أشهر"],[12,"سنة"],[0,"تاريخ نهاية مخصص"]].map(([value,label]) => <option key={value} value={value}>{tr(String(label))}</option>)}
          </select></label>
          {!months && <label className="block">{tr("نهاية الاشتراك")}<input className="field mt-2" type="date" required min={period.start} value={customEnd} disabled={busy} onChange={e => setCustomEnd(e.target.value)} /></label>}
          <label className="block">{tr("قيمة الاشتراك (ر.س)")}<input className="field mt-2" type="number" inputMode="decimal" min={0} max={1000000} step="0.01" required value={price} disabled={busy} onChange={e => setPrice(e.target.value)} /></label>
          <div className="rounded-xl border bg-canvas p-4 text-sm space-y-2" aria-live="polite"><p>{tr("بداية الاشتراك")}: <strong>{formatDate(period.start, language)}</strong></p><p>{tr("نهاية الاشتراك")}: <strong>{end ? formatDate(end, language) : "—"}</strong></p></div>
          <p className="text-xs text-muted">{tr("يبدأ التجديد بعد نهاية اشتراكك الحالي، أو من اليوم إذا انتهى.")} {tr("هذا يسجل المدة والقيمة فقط ولا ينفذ عملية دفع.")}</p>
          <button className="btn" type="submit" disabled={busy || !end || end < period.start || price === "" || !Number.isFinite(Number(price)) || Number(price) < 0 || Number(price) > 1000000}>{tr(busy ? "جارٍ الحفظ…" : previous ? "تأكيد التجديد" : "حفظ الاشتراك")}</button>
          <Notice result={result} />
        </form>
      </section>
    </div>}
  </>;
}
