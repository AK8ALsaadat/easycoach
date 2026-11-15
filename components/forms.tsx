"use client";
import { useLocale } from "./locale-provider";
import { DateInput } from "./date-input";
import { useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { mutate, type Result } from "@/app/actions";
import type { Command } from "@/lib/model";
import { showToast } from "./toast";
import { ConfirmDialog } from "./modal";
export type Field = {
  name: string;
  label: string;
  type?: "text" | "tel" | "email" | "url" | "number" | "date" | "textarea" | "select";
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
      className={`form-notice ${result.ok ? "form-notice-success" : "form-notice-error"}`}
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
  const submitting = useRef(false);
  return (
    <form
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitting.current) return;
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        const payload: Record<string, unknown> = { ...base, ...values };
        fields
          .filter((f) => f.type === "number")
          .forEach((f) => {
            payload[f.name] = Number(values[f.name]);
          });
        if (idempotent) payload.id = requestId.current ??= crypto.randomUUID();
        submitting.current = true;
        setBusy(true);
        try {
          const response = await mutate(command, payload);
          setResult(response);
          if (response.ok) {
            requestId.current = null;
            showToast({ message: response.message });
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
          submitting.current = false;
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
            ) : field.type === "date" ? (
              <DateInput id={`${prefix}-${field.name}`} name={field.name} defaultValue={field.value} className="field" required={field.required}/>
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
                maxLength={!field.type || field.type === "text" ? 140 : undefined}
                inputMode={field.type === "number" ? "decimal" : field.type === "tel" || field.name === "phone" ? "tel" : field.type === "email" ? "email" : undefined}
                autoComplete={field.type === "email" ? "email" : field.type === "tel" || field.name === "phone" ? "tel" : field.name === "name" ? "name" : undefined}
                dir={field.type === "tel" || field.name === "phone" ? "ltr" : undefined}
                aria-describedby={field.hint ? `${prefix}-${field.name}-hint` : undefined}
              />
            )}{" "}
            {tr(field.hint) ? (
              <p id={`${prefix}-${field.name}-hint`} className="mt-1 text-xs text-muted">{tr(field.hint)}</p>
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
  const submitting = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const destructive = /(?:delete|purge|revoke|fulfill)/.test(command);
  async function run() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const r = await mutate(command, payload);
      setResult(r);
      if (r.ok) {
        setConfirming(false);
        showToast({ message: r.message });
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "تعذر الاتصال. أعد المحاولة." });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => destructive ? setConfirming(true) : void run()}
      >
        {busy ? tr("لحظة…") : children}
      </button>
      <Notice result={result} />
      <ConfirmDialog open={confirming} title={tr("تأكيد الإجراء")} confirmLabel={tr("تأكيد")} busy={busy} danger onConfirm={run} onClose={() => setConfirming(false)}>
        <p>{tr("سيُطبّق هذا الإجراء على السجل المحدد. تأكد قبل المتابعة.")}</p>
        {result && !result.ok && <Notice result={result} />}
      </ConfirmDialog>
    </div>
  );
}
