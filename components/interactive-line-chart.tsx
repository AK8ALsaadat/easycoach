"use client";
import { useId, useMemo, useRef, useState } from "react";
import { useLocale } from "./locale-provider";
import { formatDate } from "@/lib/dates";
import { formatNumber, formatSigned } from "@/lib/plural";

export type ChartPoint = { date: string; value: number };

const WIDTH = 600,
  HEIGHT = 232,
  TOP = 16,
  BOTTOM = 198,
  LEFT = 52,
  RIGHT = 588;

/** Round tick values so the Y axis reads 70 / 72.5 / 75 rather than 71.3. */
function niceTicks(min: number, max: number, count = 4) {
  const span = Math.max(max - min, 1e-6);
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ??
    rough;
  const ticks: number[] = [];
  for (
    let value = Math.ceil(min / step) * step;
    value <= max + step / 1000;
    value += step
  )
    ticks.push(Math.round(value * 100) / 100);
  return ticks;
}

/**
 * A stock-app style line chart: the pointer (or arrow keys) scrubs along the
 * dates, a crosshair snaps to the nearest recorded point and the readout shows
 * that day's real value and its change from the previous record.
 */
export function InteractiveLineChart({
  points,
  target,
  unit = "",
  label,
}: {
  points: ChartPoint[];
  target?: number | null;
  unit?: string;
  label: string;
}) {
  const { t: tr, language: locale } = useLocale();
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const sorted = useMemo(
    () =>
      [...points]
        .filter((point) => Number.isFinite(point.value))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [points],
  );
  if (!sorted.length) return null;
  const values = sorted.map((point) => point.value);
  const lowest = Math.min(...values, ...(target != null ? [target] : [])),
    highest = Math.max(...values, ...(target != null ? [target] : []));
  const padding = Math.max((highest - lowest) * 0.1, 0.5);
  const min = lowest - padding,
    max = highest + padding,
    span = max - min;
  const start = Date.parse(sorted[0].date),
    end = Date.parse(sorted.at(-1)!.date);
  const x = (day: string) =>
    LEFT +
    ((Date.parse(day) - start) / Math.max(86400000, end - start)) *
      (RIGHT - LEFT);
  const y = (value: number) => BOTTOM - ((value - min) / span) * (BOTTOM - TOP);
  const ticks = niceTicks(min, max);
  const line = sorted
    .map((point) => `${x(point.date)},${y(point.value)}`)
    .join(" ");
  const index = activeIndex ?? sorted.length - 1;
  const active = sorted[index],
    previous = sorted[index - 1];
  const shortDate = (day: string) =>
    new Intl.DateTimeFormat(
      locale === "en" ? "en-GB" : "ar-SA-u-ca-gregory",
      { timeZone: "Asia/Riyadh", day: "numeric", month: "short" },
    ).format(new Date(day + "T12:00:00Z"));
  const scrub = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const viewX = ((clientX - rect.left) / rect.width) * WIDTH;
    let best = 0,
      bestDistance = Infinity;
    sorted.forEach((point, i) => {
      const distance = Math.abs(x(point.date) - viewX);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    setActiveIndex(best);
    setScrubbing(true);
  };
  const stopScrub = () => {
    setScrubbing(false);
    setActiveIndex(null);
  };
  const activeX = x(active.date),
    activeY = y(active.value);
  const nearStart = activeX < LEFT + (RIGHT - LEFT) * 0.18,
    nearEnd = activeX > RIGHT - (RIGHT - LEFT) * 0.18;
  const xLabels =
    sorted.length > 2
      ? [sorted[0], sorted[Math.floor((sorted.length - 1) / 2)], sorted.at(-1)!]
      : sorted;
  return (
    <div className="interactive-chart-block">
      <p className="chart-readout" aria-live="polite" dir="auto">
        <strong>
          <bdi dir="ltr">{formatNumber(active.value)}</bdi> {tr(unit)}
        </strong>
        <span>{formatDate(active.date, locale)}</span>
        {previous && (
          <span>
            <bdi dir="ltr">{formatSigned(active.value - previous.value)}</bdi>{" "}
            {tr(unit)} {tr("عن التسجيل السابق")}
          </span>
        )}
      </p>
      <div
        className="interactive-chart"
        role="img"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(event) => {
          const step =
            event.key === "ArrowLeft"
              ? locale === "en"
                ? -1
                : 1
              : event.key === "ArrowRight"
                ? locale === "en"
                  ? 1
                  : -1
                : 0;
          if (step) {
            event.preventDefault();
            setActiveIndex(Math.min(sorted.length - 1, Math.max(0, index + step)));
            setScrubbing(true);
          } else if (event.key === "Home") {
            event.preventDefault();
            setActiveIndex(0);
            setScrubbing(true);
          } else if (event.key === "End") {
            event.preventDefault();
            setActiveIndex(sorted.length - 1);
            setScrubbing(true);
          } else if (event.key === "Escape") stopScrub();
        }}
        onBlur={stopScrub}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          aria-hidden="true"
          onPointerMove={(event) => scrub(event.clientX)}
          onPointerDown={(event) => scrub(event.clientX)}
          onPointerLeave={stopScrub}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--ui-link)" }} stopOpacity=".22" />
              <stop offset="1" style={{ stopColor: "var(--ui-link)" }} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((value) => (
            <g key={value}>
              <line
                x1={LEFT}
                x2={RIGHT}
                y1={y(value)}
                y2={y(value)}
                stroke="currentColor"
                opacity=".1"
              />
              <text x={LEFT - 7} y={y(value) + 4} textAnchor="end" className="chart-axis-label">
                {formatNumber(value)}
              </text>
            </g>
          ))}
          {target != null && (
            <>
              <line
                x1={LEFT}
                x2={RIGHT}
                y1={y(target)}
                y2={y(target)}
                stroke="currentColor"
                opacity=".45"
                strokeDasharray="5 5"
              />
              <text
                x={RIGHT}
                y={y(target) - 6}
                textAnchor="end"
                className="chart-axis-label"
              >
                {tr("الهدف")} {formatNumber(target)}
              </text>
            </>
          )}
          {sorted.length > 1 && (
            <path
              d={`M ${line.split(" ")[0]} L ${line.split(" ").join(" L ")} L ${x(
                sorted.at(-1)!.date,
              )},${BOTTOM} L ${x(sorted[0].date)},${BOTTOM} Z`}
              fill={`url(#${gradientId})`}
            />
          )}
          <polyline
            points={line}
            fill="none"
            stroke="var(--ui-link)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {sorted.length <= 40 &&
            sorted.map((point, i) => (
              <circle
                key={point.date}
                cx={x(point.date)}
                cy={y(point.value)}
                r={i === index && scrubbing ? 0 : 3}
                fill="var(--ui-link)"
              />
            ))}
          {scrubbing && (
            <g className="chart-crosshair">
              <line
                x1={activeX}
                x2={activeX}
                y1={TOP}
                y2={BOTTOM}
                stroke="currentColor"
                opacity=".35"
                strokeDasharray="3 3"
              />
              <circle cx={activeX} cy={activeY} r={7} fill="var(--ui-surface)" stroke="var(--ui-link)" strokeWidth="2.5" />
              <circle cx={activeX} cy={activeY} r={3} fill="var(--ui-link)" />
            </g>
          )}
          {xLabels.map((point, i) => (
            <text
              key={point.date}
              x={x(point.date)}
              y={HEIGHT - 8}
              textAnchor={
                xLabels.length < 3 || i === 1
                  ? "middle"
                  : i === 0
                    ? "start"
                    : "end"
              }
              className="chart-axis-label"
            >
              {shortDate(point.date)}
            </text>
          ))}
        </svg>
        {scrubbing && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(activeX / WIDTH) * 100}%`,
              top: `${(activeY / HEIGHT) * 100}%`,
              transform: `translate(${nearStart ? "8px" : nearEnd ? "calc(-100% - 8px)" : "-50%"}, calc(-100% - 14px))`,
            }}
          >
            <strong dir="ltr">
              {formatNumber(active.value)} {tr(unit)}
            </strong>
            <span>{formatDate(active.date, locale)}</span>
            {previous && (
              <span dir="ltr">
                {formatSigned(active.value - previous.value)} {tr(unit)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
