"use client";
import { useLocale } from "./locale-provider";
import { useState } from "react";
import { addDays, riyadhToday } from "@/lib/dates";

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
  const values = selected.map((point) => point.value),
    min = Math.min(...values, ...(target != null ? [target] : [])),
    max = Math.max(...values, ...(target != null ? [target] : [])),
    spread = Math.max(1, max - min),
    y = (value: number) => 150 - ((value - min) / spread) * 115;
  const first = selected[0],
    last = selected.at(-1),
    start = first ? Date.parse(first.date) : 0,
    end = last ? Date.parse(last.date) : 1;
  const x = (day: string) =>
    30 + ((Date.parse(day) - start) / Math.max(86400000, end - start)) * 540;
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
                {first.value.toFixed(1)} {unit}
              </strong>
            </span>
            <span>
              {tr("آخر قيمة")}{" "}
              <strong>
                {last!.value.toFixed(1)} {unit}
              </strong>
            </span>
            <span>
              {tr("التغير")}{" "}
              <strong dir="ltr">
                {(last!.value - first.value).toFixed(1)} {unit}
              </strong>
            </span>
            {target != null && (
              <span>
                {tr("الهدف")} {target} {unit}
              </span>
            )}
          </div>
          <svg
            role="img"
            aria-label={title}
            viewBox="0 0 600 190"
            className="w-full my-4"
            style={{ direction: "ltr" }}
          >
            <path d="M30 165H570" stroke="#dce3ed" />
            {target != null && (
              <line
                x1={30}
                x2={570}
                y1={y(target)}
                y2={y(target)}
                stroke="#8c99ab"
                strokeDasharray="5 5"
              />
            )}
            <polyline
              points={selected
                .map((point) => `${x(point.date)},${y(point.value)}`)
                .join(" ")}
              fill="none"
              stroke="#2463eb"
              strokeWidth={3}
            />
            {selected.map((point, i) => (
              <circle
                key={i}
                cx={x(point.date)}
                cy={y(point.value)}
                r={4}
                fill="#2463eb"
                tabIndex={0}
              >
                <title>
                  {point.date}: {point.value} {unit}
                </title>
              </circle>
            ))}
          </svg>
          <div className="flex justify-between text-xs text-muted" dir="ltr">
            <span>{first.date}</span>
            <span>{last!.date}</span>
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
