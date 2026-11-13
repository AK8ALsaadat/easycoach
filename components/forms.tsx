"use client";
import { useLocale } from "./locale-provider";
import { useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { mutate, type Result } from "@/app/actions";
import type { Command } from "@/lib/model";
export type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "url" | "number" | "date" | "textarea" | "select";
  value?: string | number;
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
};
export function Notice({ result }: { result: Result | null }) {
  const { t: tr } = useLocale();

  return result ? (
    <p
      role={result.ok ? "status" : "alert"}
      className={`mt-4 rounded-xl border px-4 py-3 text-sm ${result.ok ? "border-teal/15 bg-accent/25 text-teal" : "border-red-200 bg-red-50 text-red-800"}`}
    >
      {tr(result.message)}
    </p>
  ) : null;
}
export function DataForm({
  command,
  base = {},
  fields,
  label = "حفظ",
  idempotent = false,
  refreshOnSuccess = true,
  onDone,
  children,
}: {
  command: Command;
  base?: Record<string, unknown>;
  fields: Field[];
  label?: string;
  idempotent?: boolean;
  /** Navigation callbacks must not race a refresh of the page being left. */
  refreshOnSuccess?: boolean;
  onDone?: (result: Result) => void;
  children?: ReactNode;
}) {
  const { t: tr } = useLocale();

  const router = useRouter();
  const prefix = useId();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const requestId = useRef<string | null>(null);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        const payload: Record<string, unknown> = { ...base, ...values };
        fields
          .filter((f) => f.type === "number")
          .forEach((f) => {
            payload[f.name] = Number(values[f.name]);
          });
        if (idempotent) payload.id = requestId.current ??= crypto.randomUUID();
        setBusy(true);
        try {
          const response = await mutate(command, payload);
          setResult(response);
          if (response.ok) {
            requestId.current = null;
            onDone?.(response);
            if (refreshOnSuccess) router.refresh();
          }
        } catch {
          setResult({
            ok: false,
            message:
              "تعذر الاتصال. لم نتأكد من الحفظ؛ أعد المحاولة بنفس البيانات.",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div
            key={field.name}
            className={field.type === "textarea" ? "sm:col-span-2" : ""}
          >
            <label htmlFor={`${prefix}-${field.name}`}>{tr(field.label)}</label>
            {field.type === "textarea" ? (
              <textarea
                id={`${prefix}-${field.name}`}
                name={field.name}
                defaultValue={field.value}
                className="field min-h-24"
                maxLength={2000}
                required={field.required}
              />
            ) : field.type === "select" ? (
              <select
                id={`${prefix}-${field.name}`}
                name={field.name}
                defaultValue={field.value}
                className="field"
                required={field.required}
              >
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {tr(o.label)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`${prefix}-${field.name}`}
                name={field.name}
                type={field.type ?? "text"}
                defaultValue={field.value}
                className="field"
                required={field.required}
                step={field.type === "number" ? "0.01" : undefined}
                min={field.type === "number" ? 0 : undefined}
                maxLength={field.type === "text" ? 140 : undefined}
              />
            )}{" "}
            {tr(field.hint) ? (
              <p className="mt-1 text-xs text-muted">{tr(field.hint)}</p>
            ) : null}
          </div>
        ))}
      </div>
      {children}
      <button className="btn mt-5" disabled={busy} type="submit">
        {busy ? tr("جارٍ الحفظ…") : label}
      </button>
      <Notice result={result} />
    </form>
  );
}
export function ActionButton({
  command,
  payload,
  children,
  className = "btn-secondary",
}: {
  command: Command;
  payload: Record<string, unknown>;
  children: ReactNode;
  className?: string;
}) {
  const { t: tr } = useLocale();

  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  return (
    <div>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await mutate(command, payload);
            setResult(r);
            if (r.ok) router.refresh();
          } catch {
            setResult({ ok: false, message: "تعذر الاتصال. أعد المحاولة." });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? tr("لحظة…") : children}
      </button>
      <Notice result={result} />
    </div>
  );
}
