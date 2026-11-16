"use client";
import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { amountError, parseAmount } from "@/lib/macros";
import { useLocale } from "./locale-provider";

/**
 * Number field without browser validation bubbles: accepts Arabic-Indic digits,
 * one decimal place, and shows an Arabic message under the field.
 */
export function DecimalInput({
  value,
  onValue,
  onValidity,
  max,
  className = "field",
  readOnly = false,
  ...rest
}: {
  value: number;
  onValue: (value: number) => void;
  onValidity?: (id: string, valid: boolean) => void;
  max: number;
  className?: string;
  readOnly?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "max">) {
  const { t: tr } = useLocale();
  const uid = useId();
  const id = rest.id ?? uid;
  const input = useRef<HTMLInputElement>(null);
  const report = useRef(onValidity);
  useEffect(() => { report.current = onValidity; });
  const [typed, setTyped] = useState<string | undefined>();
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (typed !== undefined && parseAmount(typed) !== value) setTyped(undefined);
  }
  const shown = readOnly || typed === undefined ? String(value) : typed;
  const error = amountError(readOnly ? value : parseAmount(shown), max);
  useEffect(() => {
    input.current?.setCustomValidity(error ? tr(error) : "");
    report.current?.(id, !error);
  }, [id, error, tr]);
  useEffect(() => () => report.current?.(id, true), [id]);
  return (
    <>
      <input
        {...rest}
        ref={input}
        id={id}
        className={className}
        dir="ltr"
        inputMode="decimal"
        autoComplete="off"
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={[rest["aria-describedby"], error ? `${id}-error` : undefined].filter(Boolean).join(" ") || undefined}
        value={shown}
        onChange={(event) => {
          const raw = event.target.value;
          setTyped(raw);
          const next = parseAmount(raw);
          const problem = amountError(next, max);
          event.currentTarget.setCustomValidity(problem ? tr(problem) : "");
          onValidity?.(id, !problem);
          if (!problem) onValue(next);
        }}
      />
      {error && <span id={`${id}-error`} className="field-error" aria-live="polite">{tr(error)}</span>}
    </>
  );
}
