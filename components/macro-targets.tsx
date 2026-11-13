"use client";
import { useId, useState } from "react";
import { Calculator, TriangleAlert } from "lucide-react";
import { useLocale } from "./locale-provider";
import {
  amountError,
  calorieMismatch,
  caloriesFromMacros,
  gramsFromSplit,
  macroSplit,
  macroTargetErrors,
  MACRO_LIMITS,
  parseAmount,
  validSplit,
  withCaloriesMode,
  type CaloriesMode,
  type MacroSplit,
  type MacroTargets as Targets,
} from "@/lib/macros";
import { formatNumber } from "@/lib/plural";

type Key = "calories" | "protein" | "carbs" | "fat";
// Keep only characters that can form a decimal number (Western or Arabic-Indic digits).
const cleanNumber = (raw: string) => raw.replace(/[^0-9٠-٩۰-۹.,٫]/g, "");

/** Distribution of energy between protein, carbs and fat as a small bar plus text. */
export function MacroSplitBar({ value, className = "" }: { value: { protein: number; carbs: number; fat: number }; className?: string }) {
  const { t: tr } = useLocale();
  const split = macroSplit(value);
  if (!split) return null;
  const parts = [
    ["protein", "بروتين", split.protein],
    ["carbs", "كارب", split.carbs],
    ["fat", "دهون", split.fat],
  ] as const;
  const label = parts.map(([, name, pct]) => `${tr(name)} ${pct}%`).join(" · ");
  return (
    <div className={`macro-split ${className}`}>
      <div className="macro-split-bar" role="img" aria-label={tr("توزيع السعرات: {0}", label)}>
        {parts.map(([key, , pct]) => pct > 0 && <span key={key} className={`macro-split-${key}`} style={{ inlineSize: `${pct}%` }} />)}
      </div>
      <p className="macro-split-legend" aria-hidden="true">
        {parts.map(([key, name, pct]) => (
          <span key={key}><i className={`macro-split-${key}`} />{tr(name)} <bdi dir="ltr">{pct}%</bdi></span>
        ))}
      </p>
    </div>
  );
}

export function MacroTargets({
  value,
  onChange,
  disabled = false,
  idPrefix,
}: {
  value: Targets & { calories_mode: CaloriesMode };
  onChange: (next: Targets & { calories_mode: CaloriesMode }) => void;
  disabled?: boolean;
  /** Stable element ids (`${idPrefix}-calories`, …) for pages and tests that target them. */
  idPrefix?: string;
}) {
  const { t: tr } = useLocale();
  const generated = useId();
  const uid = idPrefix ?? generated;
  const mode = value.calories_mode;
  const [text, setText] = useState<Partial<Record<Key, string>>>({});
  const [split, setSplit] = useState<MacroSplit>(() => macroSplit(value) ?? { protein: 30, carbs: 45, fat: 25 });
  const [splitText, setSplitText] = useState<Partial<Record<keyof MacroSplit, string>>>({});
  const [reverseCalories, setReverseCalories] = useState(() => (value.calories ? String(value.calories) : ""));
  const errors = macroTargetErrors(value);
  const computed = caloriesFromMacros(value);
  const mismatch = mode === "manual" ? calorieMismatch(value.calories, value) : null;
  const emit = (next: Targets) => onChange(withCaloriesMode({ ...next, calories_mode: mode }, mode));

  // Show what the coach typed while it parses to the stored number; otherwise
  // the stored value changed elsewhere (adopted total, meal sum) and wins.
  const display = (key: Key) => {
    const typed = text[key];
    if (typed !== undefined) {
      const parsed = parseAmount(typed);
      if (Number.isNaN(parsed) || parsed === value[key]) return typed;
    }
    return key === "calories" && mode === "auto" ? String(computed) : String(value[key]);
  };
  const edit = (key: Key, raw: string) => {
    const cleaned = cleanNumber(raw);
    setText((old) => ({ ...old, [key]: cleaned }));
    const parsed = parseAmount(cleaned);
    if (!Number.isNaN(parsed)) emit({ ...value, [key]: parsed });
  };
  const fields = [
    ["protein", "البروتين (غ)", MACRO_LIMITS.grams],
    ["carbs", "الكارب (غ)", MACRO_LIMITS.grams],
    ["fat", "الدهون (غ)", MACRO_LIMITS.grams],
  ] as const;
  const splitTotal = Math.round((split.protein + split.carbs + split.fat) * 10) / 10;
  const reverseValue = parseAmount(reverseCalories);
  const reverseError = reverseCalories === "" ? null : amountError(reverseValue, MACRO_LIMITS.calories);
  const splitReady = validSplit(split) && reverseCalories !== "" && !reverseError && reverseValue > 0;

  return (
    <div className="macro-targets space-y-4" data-testid="macro-targets">
      <div className="macro-mode">
        <button
          type="button"
          role="switch"
          aria-checked={mode === "auto"}
          aria-labelledby={`${uid}-mode-label`}
          aria-describedby={`${uid}-mode-hint`}
          className="macro-switch"
          disabled={disabled}
          onClick={() => onChange(withCaloriesMode(value, mode === "auto" ? "manual" : "auto"))}
        >
          <span aria-hidden="true" />
        </button>
        <div>
          <p id={`${uid}-mode-label`} className="font-semibold">{tr("احسب السعرات تلقائيًا من الماكروز")}</p>
          <p id={`${uid}-mode-hint`} className="text-xs text-muted">
            {tr(mode === "auto" ? "السعرات = البروتين × 4 + الكارب × 4 + الدهون × 9، وتتحدث مع كل تغيير." : "الوضع اليدوي: اكتب السعرات بنفسك، وننبهك إذا اختلفت عن مجموع الماكروز.")}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div>
          <label htmlFor={`${uid}-calories`}>{tr("السعرات (kcal)")}</label>
          <input
            id={`${uid}-calories`}
            className="field mt-2"
            dir="ltr"
            inputMode="decimal"
            autoComplete="off"
            readOnly={mode === "auto"}
            aria-readonly={mode === "auto"}
            aria-invalid={Boolean(errors.calories)}
            aria-describedby={errors.calories ? `${uid}-calories-error` : undefined}
            disabled={disabled}
            value={display("calories")}
            onChange={(event) => edit("calories", event.target.value)}
          />
          {errors.calories && <p id={`${uid}-calories-error`} className="field-error">{tr(errors.calories)}</p>}
        </div>
        {fields.map(([key, label]) => (
          <div key={key}>
            <label htmlFor={`${uid}-${key}`}>{tr(label)}</label>
            <input
              id={`${uid}-${key}`}
              className="field mt-2"
              dir="ltr"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={Boolean(errors[key])}
              aria-describedby={errors[key] ? `${uid}-${key}-error` : undefined}
              disabled={disabled}
              value={display(key)}
              onChange={(event) => edit(key, event.target.value)}
            />
            {errors[key] && <p id={`${uid}-${key}-error`} className="field-error">{tr(errors[key])}</p>}
          </div>
        ))}
      </div>
      <MacroSplitBar value={value} />
      {mismatch?.exceeds && (
        <div className="macro-warning" role="status">
          <TriangleAlert size={18} aria-hidden="true" />
          <p>
            {tr(
              "مجموع الماكروز = {0} سعرة، والسعرات المدخلة = {1} (فرق {2}٪)",
              formatNumber(mismatch.computed),
              formatNumber(mismatch.entered),
              String(Math.round(mismatch.ratio * 100)),
            )}
          </p>
          <button type="button" className="btn-secondary" disabled={disabled} onClick={() => onChange({ ...value, calories: mismatch.computed })}>
            {tr("اعتمد السعرات المحسوبة")}
          </button>
        </div>
      )}
      <details className="macro-reverse">
        <summary>{tr("احسب الجرامات من السعرات ونسب التوزيع (اختياري)")}</summary>
        <p className="mt-2 text-xs text-muted">{tr("مثال: 2,000 سعرة بتوزيع 40/35/25 للبروتين والكارب والدهون.")}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label>
            {tr("السعرات المستهدفة")}
            <input className="field mt-1" dir="ltr" inputMode="decimal" disabled={disabled} value={reverseCalories} aria-invalid={Boolean(reverseError)} onChange={(event) => setReverseCalories(cleanNumber(event.target.value))} />
            {reverseError && <span className="field-error">{tr(reverseError)}</span>}
          </label>
          {(["protein", "carbs", "fat"] as const).map((key) => (
            <label key={key}>
              {tr(key === "protein" ? "بروتين ٪" : key === "carbs" ? "كارب ٪" : "دهون ٪")}
              <input
                className="field mt-1"
                dir="ltr"
                inputMode="decimal"
                disabled={disabled}
                value={splitText[key] ?? String(split[key])}
                onChange={(event) => {
                  const cleaned = cleanNumber(event.target.value);
                  setSplitText((old) => ({ ...old, [key]: cleaned }));
                  const parsed = parseAmount(cleaned);
                  if (!Number.isNaN(parsed)) setSplit((old) => ({ ...old, [key]: parsed }));
                }}
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className={`badge ${Math.abs(splitTotal - 100) < 0.01 ? "" : "badge-warning"}`}>
            {tr("المجموع")} <bdi dir="ltr">{splitTotal}%</bdi>
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={disabled || !splitReady}
            onClick={() => {
              const next = { ...value, ...gramsFromSplit(reverseValue, split) };
              setText({});
              onChange(mode === "auto" ? withCaloriesMode(next, "auto") : { ...next, calories: reverseValue });
            }}
          >
            <Calculator size={16} aria-hidden="true" />
            {tr("احسب الجرامات")}
          </button>
          {!validSplit(split) && <span className="text-xs text-muted">{tr("مجموع النسب لازم يساوي 100٪.")}</span>}
        </div>
      </details>
    </div>
  );
}
