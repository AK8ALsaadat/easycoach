"use client";
import { useLocale } from "./locale-provider";
import { useState } from "react";
import { Scale, TrendingDown, Plus, Trash2 } from "lucide-react";
import type { WeightEntry } from "@/lib/model";
import { riyadhToday, formatDate } from "@/lib/dates";
import { formatNumber, formatSigned, lastEntries } from "@/lib/plural";
import { ConfirmDialog } from "./modal";
export function WeightPanel({
  entries,
  target,
  onSave,
  onDelete,
  compact = false,
}: {
  entries: WeightEntry[];
  target?: number | null;
  onSave?: (day: string, weight: number) => Promise<string | undefined>;
  onDelete?: (day: string) => Promise<string | undefined>;
  compact?: boolean;
}) {
  const { t: tr, language: locale } = useLocale();

  const ordered = [...entries].sort((a, b) =>
    a.entry_date.localeCompare(b.entry_date),
  );
  const recent = ordered.slice(-30);
  const last = ordered.at(-1),
    first = ordered[0];
  const average =
    ordered.slice(-7).reduce((n, e) => n + Number(e.weight), 0) /
    Math.min(7, ordered.length);
  const [day, setDay] = useState(riyadhToday()),
    [weight, setWeight] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [pendingDelete, setPendingDelete] = useState<WeightEntry | null>(null);
  async function confirmDelete() {
    if (!pendingDelete || !onDelete) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const err = await onDelete(pendingDelete.entry_date);
      if (err) setError(err);
      else setMessage("تم حذف تسجيل الوزن");
      setPendingDelete(null);
    } catch {
      setError("تعذر الاتصال. لم نتأكد من الحذف؛ حدّث السجل قبل إعادة المحاولة.");
      setPendingDelete(null);
    } finally {
      setBusy(false);
    }
  }
  const low = Math.min(...recent.map((e) => Number(e.weight))) - 1,
    high = Math.max(...recent.map((e) => Number(e.weight))) + 1;
  const start = recent[0] ? Date.parse(recent[0].entry_date) : 0,
    end = recent.at(-1) ? Date.parse(recent.at(-1)!.entry_date) : 1;
  // The plot leaves room on the left for labelled Y-axis values (kg).
  const plotStart = 52, plotEnd = 492;
  const points = recent.map(
    (e) =>
      `${plotStart + ((Date.parse(e.entry_date) - start) / Math.max(86400000, end - start)) * (plotEnd - plotStart)},${135 - ((Number(e.weight) - low) / (high - low)) * 110}`,
  );
  const yTicks = [35, 80, 125].map((y) => ({ y, value: low + ((135 - y) / 110) * (high - low) }));
  return (
    <section className={"weight-panel " + (compact ? "" : "card p-5")}>
      <div className="section-title">
        <div>
          <p className="eyebrow">{tr("متابعة الوزن · كجم")}</p>
          <h2 className="flex items-center gap-2">
            <Scale size={20} />
            {tr("متابعة الوزن")}
          </h2>
        </div>
        {target ? (
          <span className="badge">
            {tr("الهدف")} {target} {tr("كجم")}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="metric-number">
            {last ? formatNumber(Number(last.weight)) : "—"}
          </p>
          <p className="text-xs text-muted">
            {tr("آخر وزن ·")}{" "}
            {last ? formatDate(last.entry_date, locale) : tr("لم يُسجل")}
          </p>
        </div>
        <div>
          <p className="metric-number">
            <bdi dir="ltr">
              {last && first
                ? formatSigned(Number(last.weight) - Number(first.weight))
                : "—"}
            </bdi>
          </p>
          <p className="text-xs text-muted">{tr("التغير منذ أول تسجيل")}</p>
        </div>
        <div>
          <p className="metric-number">
            {ordered.length ? formatNumber(average) : "—"}
          </p>
          <p className="text-xs text-muted">
            {tr("متوسط {0}", lastEntries(locale, Math.min(7, ordered.length)))}
          </p>
        </div>
      </div>
      {recent.length > 1 ? (
        <div className="weight-chart">
          <svg
            viewBox="0 0 500 155"
            role="img"
            aria-label={tr("تغير الوزن خلال آخر 30 تسجيلًا")}
          >
            <defs>
              <linearGradient id="weight-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#3677f2" stopOpacity=".2" />
                <stop offset="1" stopColor="#3677f2" stopOpacity="0" />
              </linearGradient>
            </defs>
            {yTicks.map(({ y, value }) => (
              <g key={y}>
                <line
                  x1={plotStart}
                  x2={plotEnd}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  opacity=".12"
                />
                <text x={plotStart - 6} y={y + 4} textAnchor="end" direction="ltr" className="weight-axis-label">
                  {formatNumber(value)}
                </text>
              </g>
            ))}
            <path
              d={`M ${points[0]} L ${points.join(" L ")} L ${plotEnd},150 L ${plotStart},150 Z`}
              fill="url(#weight-fill)"
            />
            <polyline
              points={points.join(" ")}
              fill="none"
              stroke="#3677f2"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.split(",")[0]}
                cy={p.split(",")[1]}
                r="3"
                fill="#3677f2"
              />
            ))}
          </svg>
          <div className="flex justify-between text-xs text-muted">
            <span>{formatDate(recent[0].entry_date, locale)}</span>
            <span>{formatDate(recent.at(-1)!.entry_date, locale)}</span>
          </div>
        </div>
      ) : (
        <div className="my-5 flex items-center gap-3 border border-dashed p-4 text-xs text-muted">
          <TrendingDown size={24} />
          {recent.length
            ? tr("سجّل مرة ثانية لعرض منحنى التغير.")
            : tr("أول تسجيل يبدأ خط المتابعة.")}
        </div>
      )}
      {onSave ? (
        <form
          className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const value = Number(weight.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,،٫]/g, "."));
            if (!day) { setError("اختر تاريخ الوزن"); return; }
            if (day > riyadhToday()) { setError("لا يمكن تسجيل وزن بتاريخ قادم"); return; }
            if (!weight.trim()) { setError("أدخل الوزن بالكيلوجرام"); return; }
            if (!Number.isFinite(value) || value < 20 || value > 400) { setError("الوزن بين 20 و400 كجم"); return; }
            setBusy(true);
            setError("");
            setMessage("");
            try {
              const err = await onSave(day, Math.round(value * 10) / 10);
              if (err) setError(err);
              else {
                setMessage("تم حفظ الوزن");
                setWeight("");
              }
            } catch {
              setError("تعذر الحفظ. أعد المحاولة");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="text-xs">
            {tr("اليوم")}
            <input
              aria-label={tr("تاريخ الوزن")}
              disabled={busy}
              className="field mt-1"
              type="date"
              max={riyadhToday()}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              required
            />
          </label>
          <label className="text-xs">
            {tr("الوزن (كجم)")}
            <input
              aria-label={tr("الوزن بالكيلوجرام")}
              disabled={busy}
              className="field mt-1"
              type="text"
              inputMode="decimal"
              dir="ltr"
              autoComplete="off"
              placeholder={tr("مثال: 82.4")}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <button className="btn self-end" disabled={busy}>
            <Plus size={15} />
            {busy
              ? tr("نحفظ…")
              : ordered.some((w) => w.entry_date === day)
                ? tr("تصحيح الوزن")
                : tr("تسجيل")}
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {tr(error)}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-3 text-sm text-teal">
          {tr(message)}
        </p>
      ) : null}
      {ordered.length ? (
        <details className="mt-4 border-t pt-3">
          <summary className="text-xs">
            {tr("سجل الأوزان ·")} {ordered.length}
          </summary>
          <div className="mt-3 max-h-56 overflow-auto">
            {ordered
              .slice()
              .reverse()
              .map((w) => (
                <div
                  className="flex items-center justify-between border-b py-2 text-sm"
                  key={w.id}
                >
                  <span>{formatDate(w.entry_date, locale)}</span>
                  <strong><bdi>{formatNumber(Number(w.weight))}</bdi> {tr("كجم")}</strong>
                  {onDelete ? (
                    <button
                      aria-label={tr("حذف وزن ") + w.entry_date}
                      className="p-2 text-muted"
                      disabled={busy}
                      onClick={() => {
                        setMessage("");
                        setPendingDelete(w);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              ))}
          </div>
        </details>
      ) : null}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={tr("حذف تسجيل الوزن؟")}
        confirmLabel="حذف"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      >
        {pendingDelete && tr("سيُحذف وزن {0} كجم بتاريخ {1}. يمكنك تسجيله مرة ثانية متى ما أردت.", formatNumber(Number(pendingDelete.weight)), formatDate(pendingDelete.entry_date, locale))}
      </ConfirmDialog>
    </section>
  );
}
