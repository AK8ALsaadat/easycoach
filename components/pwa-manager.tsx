"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLocale } from "./locale-provider";
import { PLAN_CACHE, SW_URL } from "@/lib/pwa";

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
  if (!waiting) return null;
  return (
    <div className="pwa-update" role="status">
      <p>{tr("تحديث متوفر — اضغط للتحديث")}</p>
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
    </div>
  );
}
