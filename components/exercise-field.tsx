"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "./locale-provider";
import { parseReps, parseRest, parseSets } from "@/lib/program-validation";

type Field = "sets" | "reps" | "rest";
const parsers = { sets: parseSets, reps: parseReps, rest: parseRest } as const;

/**
 * Sets / reps / rest cell. Keeps the raw text while typing and commits only valid
 * values, so "abc" shows an error and "-5" is never turned into "05".
 */
export function ExerciseField({
  id,
  field,
  label,
  value,
  onCommit,
  onValidity,
}: {
  id: string;
  field: Field;
  label: string;
  value: number | string;
  onCommit: (value: number | string) => void;
  /** Lets the editor block saving while a cell holds invalid text. */
  onValidity?: (id: string, valid: boolean) => void;
}) {
  const { t: tr } = useLocale();
  const [raw, setRaw] = useState(String(value));
  const [error, setError] = useState("");
  const report = useRef(onValidity);
  useEffect(() => {
    report.current = onValidity;
  });
  // A removed row must not keep blocking the save.
  useEffect(() => () => report.current?.(id, true), [id]);
  // Follow external changes (undo, moving rows) unless the user is mid-edit on an invalid value.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!error) setRaw(String(value));
  }
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="field"
        type="text"
        inputMode={field === "reps" ? "text" : "numeric"}
        dir="ltr"
        autoComplete="off"
        value={raw}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          const next = event.target.value;
          setRaw(next);
          const parsed = parsers[field](next);
          onValidity?.(id, parsed.error === undefined);
          if (parsed.error !== undefined) {
            // Update an error already shown; a first error appears on blur so "8-" mid-typing is quiet.
            if (error) setError(parsed.error);
            return;
          }
          setError("");
          onCommit(parsed.value);
        }}
        onBlur={() => {
          const parsed = parsers[field](raw);
          if (parsed.error !== undefined) setError(parsed.error);
          else setRaw(String(parsed.value));
        }}
      />
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {tr(error)}
        </p>
      )}
    </div>
  );
}
