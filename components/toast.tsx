"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLocale } from "./locale-provider";

type ToastInput = { message: string; tone?: "success" | "error"; action?: { label: string; run: () => void | Promise<void> }; duration?: number };
type Toast = ToastInput & { id: number; until: number };
const EVENT = "easycoach:toast";
let counter = 0;
// Kept so a host that mounts right after a navigation (archive → roster) still shows it.
let latest: Toast | null = null;

/** Shows a toast from anywhere in the client (survives client-side navigation). */
export function showToast(input: ToastInput) {
  latest = { ...input, id: ++counter, until: Date.now() + (input.duration ?? 5000) };
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: latest }));
}

export function ToastHost() {
  const { t: tr } = useLocale();
  const [toast, setToast] = useState<Toast | null>(null);
  const [running, setRunning] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const display = (next: Toast) => {
      const remaining = next.until - Date.now();
      if (remaining <= 0) return;
      window.clearTimeout(timer.current);
      setToast(next);
      timer.current = window.setTimeout(() => {
        setToast((current) => (current?.id === next.id ? null : current));
        if (latest?.id === next.id) latest = null;
      }, remaining);
    };
    const listener = (event: Event) => display((event as CustomEvent<Toast>).detail);
    window.addEventListener(EVENT, listener);
    const pending = latest;
    const initial = pending ? window.setTimeout(() => display(pending), 0) : undefined;
    return () => {
      window.removeEventListener(EVENT, listener);
      window.clearTimeout(timer.current);
      window.clearTimeout(initial);
    };
  }, []);
  // Closes only this toast: an action may already have shown a newer one.
  const close = (id = toast?.id) => {
    if (latest?.id === id) latest = null;
    setToast((current) => (current?.id === id ? null : current));
  };
  if (!toast) return null;
  return (
    <div className={`app-toast ${toast.tone === "error" ? "app-toast-error" : ""}`} role={toast.tone === "error" ? "alert" : "status"} aria-live="polite">
      <p>{tr(toast.message)}</p>
      {toast.action && (
        <button
          type="button"
          className="app-toast-action"
          disabled={running}
          onClick={async () => {
            setRunning(true);
            window.clearTimeout(timer.current);
            try {
              await toast.action!.run();
            } finally {
              setRunning(false);
              close();
            }
          }}
        >
          {tr(toast.action.label)}
        </button>
      )}
      <button type="button" className="app-toast-close" aria-label={tr("إغلاق")} onClick={() => close()}>
        <X size={16} />
      </button>
    </div>
  );
}
