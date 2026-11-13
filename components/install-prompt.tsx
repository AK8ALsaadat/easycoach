"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";
import { useLocale } from "./locale-provider";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const KEY = "ec_install_prompt_dismissed";
const EVENT = "easycoach:install-dismissed";

function dismissed() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function remember() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* Blocked storage: the banner may return next visit, which is harmless. */
  }
  window.dispatchEvent(new Event(EVENT));
}
const subscribe = (notify: () => void) => {
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener("storage", notify);
  };
};
/** iOS Safari has no install event; it needs Share → Add to Home Screen. */
function platform() {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return ios && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua) ? "ios" : "other";
}

export function InstallPrompt() {
  const { t: tr } = useLocale();
  const hidden = useSyncExternalStore(subscribe, dismissed, () => true);
  const kind = useSyncExternalStore(() => () => undefined, platform, () => "installed");
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
    };
    const installed = () => remember();
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  if (hidden || kind === "installed" || (kind !== "ios" && !deferred)) return null;
  return (
    <aside className="install-banner" aria-label={tr("تثبيت التطبيق")}>
      <div>
        <strong>{tr("ثبّت التطبيق على جوالك")}</strong>
        <p>
          {kind === "ios" ? (
            <>
              {tr("اضغط زر المشاركة")} <Share size={14} aria-label={tr("مشاركة")} /> {tr("ثم «إضافة إلى الشاشة الرئيسية».")}
            </>
          ) : (
            tr("افتح برنامجك بضغطة، وشوف تمارين اليوم حتى بدون إنترنت.")
          )}
        </p>
      </div>
      {deferred && (
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice.catch(() => undefined);
            setDeferred(null);
            remember();
          }}
        >
          <Download size={16} aria-hidden="true" />
          {tr("تثبيت")}
        </button>
      )}
      <button type="button" className="icon-button" aria-label={tr("إغلاق")} onClick={remember}>
        <X size={18} />
      </button>
    </aside>
  );
}
