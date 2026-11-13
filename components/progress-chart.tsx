"use client";
import { useLocale } from "./locale-provider";
import { formatNumber, formatSigned } from "@/lib/plural";
import { useState } from "react";
import { addDays, riyadhToday } from "@/lib/dates";
import { InteractiveLineChart } from "./interactive-line-chart";

export function ProgressChart({
  points,
  target,
  unit = "كجم",
  title,
  defaultRange = "30",
}: {
  points: { date: string; value: number }[];
  target?: number | null;
  unit?: string;
  title: string;
  defaultRange?: "7" | "30" | "90" | "all";
}) {
  const { t: tr } = useLocale();

  const [range, setRange] = useState(defaultRange),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(riyadhToday());
  const earliest = points.filter(point=>point.date<=to && Number.isFinite(point.value)).map(point=>point.date).sort()[0] ?? to;
  const lower =
    from ||
    (range === "all" ? earliest : addDays(riyadhToday(), -Number(range)));
  const selected = points
    .filter((point) => point.date >= lower && point.date <= to && Number.isFinite(point.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = selected[0],
    last = selected.at(-1);
  return (
    <section className="card p-5" role="region" aria-label={title}>
      <div className="section-title">
        <h2>{title}</h2>
        <select
          aria-label={tr("مدة عرض التقدم")}
          className="field max-w-48"
          value={range}
          onChange={(event) => {
            setRange(event.target.value as typeof range);
            setFrom("");
          }}
        >
          <option value="7">{tr("أسبوع")}</option>
          <option value="30">{tr("شهر")}</option>
          <option value="90">{tr("3 أشهر")}</option>
          <option value="all">{tr("كامل السجل")}</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <label>
          {tr("من")}
          <input
            className="field"
            aria-label={tr("مقارنة التقدم من")}
            type="date"
            value={from || lower}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          {tr("إلى")}
          <input
            className="field"
            aria-label={tr("مقارنة التقدم إلى")}
            type="date"
            min={from || undefined}
            max={riyadhToday()}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
      </div>
      {selected.length ? (
        <>
          <div className="flex flex-wrap gap-5 text-sm">
            <span>
              {tr("أول قيمة")}{" "}
              <strong>
                <bdi dir="ltr">{formatNumber(first.value)}</bdi> {tr(unit)}
              </strong>
            </span>
            <span>
              {tr("آخر قيمة")}{" "}
              <strong>
                <bdi dir="ltr">{formatNumber(last!.value)}</bdi> {tr(unit)}
              </strong>
            </span>
            <span>
              {tr("التغير")}{" "}
              <strong dir="ltr">
                <bdi dir="ltr">{formatSigned(last!.value - first.value)}</bdi> {tr(unit)}
              </strong>
            </span>
            {target != null && (
              <span>
                {tr("الهدف")} <bdi dir="ltr">{formatNumber(target)}</bdi> {tr(unit)}
              </span>
            )}
          </div>
          <div className="my-4">
            <InteractiveLineChart
              points={selected}
              target={target}
              unit={unit}
              label={title}
            />
          </div>
        </>
      ) : (
        <div className="empty">
          <p>
            {tr(
              "لا توجد سجلات ضمن الفترة المختارة. غيّر الفترة أو أضف أول قياس.",
            )}
          </p>
        </div>
      )}
    </section>
  );
}
