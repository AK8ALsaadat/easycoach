"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useLocale } from "./locale-provider";
import { PLAN_CACHE, SW_URL } from "@/lib/pwa";
import { refreshHeld } from "@/lib/client-activity";

const BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? "dev";

/** Removes the cached plan (call on logout so a shared phone keeps nothing). */
export function clearPrivateCaches() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PRIVATE" });
    void window.caches?.delete(PLAN_CACHE);
  } catch {
    /* Caches unavailable: nothing was stored. */
  }
}

/** Registers the service worker (production builds) and offers updates. */
export function PwaManager() {
  const { t: tr } = useLocale();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [hidden, setHidden] = useState(false);
  const requested = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    let check: (() => void) | undefined;
    // Reload only after the user asked for the update (not on first install).
    const onControllerChange = () => {
      if (requested.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker
      .register(`${SW_URL}?v=${encodeURIComponent(BUILD)}`, { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;
        const track = (worker: ServiceWorker | null) =>
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
          });
        if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
        track(registration.installing);
        registration.addEventListener("updatefound", () => track(registration.installing));
        check = () => {
          if (document.visibilityState === "visible") void registration.update().catch(() => undefined);
        };
        document.addEventListener("visibilitychange", check);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (check) document.removeEventListener("visibilitychange", check);
    };
  }, []);
  // Apply the update on the way out instead of interrupting the work in
  // progress: when the tab is hidden and nothing is mid-save, the new worker
  // takes over and the page the coach comes back to is already current.
  useEffect(() => {
    if (!waiting) return;
    const apply = () => {
      if (document.visibilityState !== "hidden" || refreshHeld()) return;
      requested.current = true;
      waiting.postMessage({ type: "SKIP_WAITING" });
    };
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, [waiting]);
  if (!waiting || hidden) return null;
  return (
    <div className="pwa-update" role="status">
      <p>{tr("فيه تحديث جاهز")}</p>
      <button
        type="button"
        className="btn"
        onClick={() => {
          requested.current = true;
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        <RefreshCw size={16} aria-hidden="true" />
        {tr("تحديث")}
      </button>
      <button type="button" className="icon-button" aria-label={tr("إخفاء إشعار التحديث")} onClick={() => setHidden(true)}>
        <X size={16} />
      </button>
    </div>
  );
}
