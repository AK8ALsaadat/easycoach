"use client";
import { useState, type InputHTMLAttributes } from "react";
import { amountError, parseAmount } from "@/lib/macros";
import { useLocale } from "./locale-provider";

const cleanNumber = (raw: string) => raw.replace(/[^0-9٠-٩۰-۹.,٫]/g, "");

/**
 * Number field without browser validation bubbles: accepts Arabic-Indic digits,
 * one decimal place, and shows an Arabic message under the field.
 */
export function DecimalInput({
  value,
  onValue,
  max,
  className = "field",
  readOnly = false,
  ...rest
}: {
  value: number;
  onValue: (value: number) => void;
  max: number;
  className?: string;
  readOnly?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "max">) {
  const { t: tr } = useLocale();
  const [typed, setTyped] = useState<string | undefined>();
  const parsed = typed === undefined ? Number.NaN : parseAmount(typed);
  const shown = typed !== undefined && (Number.isNaN(parsed) || parsed === value) ? typed : String(value);
  const error = readOnly ? null : amountError(value, max);
  return (
    <>
      <input
        {...rest}
        className={className}
        dir="ltr"
        inputMode="decimal"
        autoComplete="off"
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        aria-invalid={Boolean(error)}
        value={shown}
        onChange={(event) => {
          const cleaned = cleanNumber(event.target.value);
          setTyped(cleaned);
          const next = parseAmount(cleaned);
          if (!Number.isNaN(next)) onValue(next);
        }}
      />
      {error && <span className="field-error">{tr(error)}</span>}
    </>
  );
}
