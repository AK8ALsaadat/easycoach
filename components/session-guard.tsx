"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, UserX } from "lucide-react";
import { Modal } from "./modal";
import { useLocale } from "./locale-provider";
import { sessionIdentity } from "@/lib/client-activity";

type Trouble = "expired" | "switched";

/**
 * Keeps the rendered identity and the cookie identity honest about each other.
 *
 * The page was rendered for exactly one account. If the browser's session is
 * later replaced (another sign-in, a verification link, an OAuth return) or has
 * expired, this is announced in place — the page and its unsaved work stay on
 * screen behind a dialog — instead of silently showing or writing to the wrong
 * account, or hard-redirecting to the login page mid-edit.
 */
export function SessionGuard({ userId }: { userId: string }) {
  const { t: tr } = useLocale();
  const [trouble, setTrouble] = useState<Trouble | null>(null);

  const check = useCallback(async () => {
    const identity = await sessionIdentity();
    // "unknown" means we could not tell; never accuse a working session.
    if (identity.state === "unknown") return;
    if (identity.state === "expired") setTrouble("expired");
    else if (identity.userId && identity.userId !== userId) setTrouble("switched");
    else setTrouble(null);
  }, [userId]);

  useEffect(() => {
    if (trouble) return;
    const initial = window.setTimeout(() => void check(), 0);
    const timer = window.setInterval(() => void check(), 45000);
    const onFocus = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [check, trouble]);

  if (!trouble) return null;
  const switched = trouble === "switched";
  return (
    <Modal
      open
      dismissible={false}
      onClose={() => {}}
      className="max-w-md"
      title={
        <span className="flex items-center gap-2">
          {switched ? <UserX size={20} /> : <AlertTriangle size={20} />}
          {tr(switched ? "هذي الصفحة لحساب ثاني" : "انتهت جلستك")}
        </span>
      }
    >
      <p className="text-sm leading-7 text-muted">
        {tr(
          switched
            ? "تم تسجيل الدخول بحساب مختلف في هذا المتصفح، فما نعرض لك بيانات الحساب اللي فتحت به الصفحة. حدّث الصفحة لعرض الحساب الحالي — وانسخ أي تعديل غير محفوظ قبل التحديث."
            : "ما نقدر نحفظ شي قبل تسجيل الدخول من جديد. صفحتك وتعديلاتك باقية هنا؛ سجّل الدخول في تبويب ثاني ثم ارجع وحدّث.",
        )}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <a className="btn" href="/login" target="_blank" rel="noopener noreferrer">
          {tr("تسجيل الدخول في تبويب جديد")}
        </a>
        <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
          {tr("تحديث الصفحة")}
        </button>
        <button type="button" className="btn-soft" onClick={() => void check()}>
          {tr("تحققت، أعد الفحص")}
        </button>
      </div>
    </Modal>
  );
}
