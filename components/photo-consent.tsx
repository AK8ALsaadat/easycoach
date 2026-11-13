"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Camera, ShieldCheck, Trash2 } from "lucide-react";
import { acceptPhotoConsent, revokePhotoConsent } from "@/app/photo-consent-actions";
import {
  PHOTO_CONSENT_VERSION,
  photoConsentPoints,
  photoConsentTip,
  rememberConsentDismissed,
  shouldPromptConsent,
  wasConsentDismissed,
  type PhotoConsentState,
} from "@/lib/photo-consent";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";

const DISMISS_EVENT = "easycoach:photo-consent-dismissed";
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(DISMISS_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(DISMISS_EVENT, notify);
  };
};

/** Opens once after linking (or when the notice changed) unless the trainee chose "مو الحين" on this device. */
export function useConsentPrompt(state: PhotoConsentState | undefined, clientId: string) {
  const version = state?.current_version ?? PHOTO_CONSENT_VERSION;
  // The server snapshot reports "dismissed" so nothing opens before hydration.
  const dismissed = useSyncExternalStore(subscribe, () => wasConsentDismissed(clientId, version), () => true);
  const [closed, setClosed] = useState(false);
  return {
    open: Boolean(clientId) && shouldPromptConsent(state) && !dismissed && !closed,
    dismiss() {
      rememberConsentDismissed(clientId, version);
      window.dispatchEvent(new Event(DISMISS_EVENT));
      setClosed(true);
    },
    close: () => setClosed(true),
  };
}

export function PhotoConsentDialog({
  open,
  clientId,
  coachName,
  portalToken,
  onLater,
  onAccepted,
}: {
  open: boolean;
  clientId: string;
  coachName: string;
  portalToken?: string;
  onLater: () => void;
  onAccepted: (state: PhotoConsentState) => void | Promise<unknown>;
}) {
  const { t: tr } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal open={open} onClose={() => !busy && onLater()} title={tr("قبل ما ترفع صور التقدم")} className="max-w-xl">
      <ul className="consent-points" data-testid="photo-consent-points">
        {photoConsentPoints().map((point) => <li key={point}>{tr(point, coachName)}</li>)}
      </ul>
      <p className="consent-tip"><Camera size={16} aria-hidden="true" />{tr(photoConsentTip)}</p>
      <Link href="/privacy" target="_blank" rel="noopener" className="mt-3 inline-flex text-sm text-teal underline">{tr("اقرأ سياسة الخصوصية كاملة")}</Link>
      {error && <p role="alert" className="field-error mt-3">{tr(error)}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await acceptPhotoConsent(clientId, PHOTO_CONSENT_VERSION, portalToken);
              if (!result.ok) setError(result.message);
              else await onAccepted(result.state);
            } catch {
              setError("تعذر الاتصال. لم نحفظ الموافقة؛ أعد المحاولة.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <ShieldCheck size={17} aria-hidden="true" />
          {tr(busy ? "نحفظ موافقتك…" : "موافق، أبي أرفع صور")}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={onLater}>{tr("مو الحين")}</button>
      </div>
    </Modal>
  );
}

/** Stop progress photos: keep earlier photos, or delete them all after a second confirmation. */
export function RevokeConsentDialog({
  open,
  clientId,
  portalToken,
  onClose,
  onDone,
}: {
  open: boolean;
  clientId: string;
  portalToken?: string;
  onClose: () => void;
  onDone: (state: PhotoConsentState, message: string) => void | Promise<unknown>;
}) {
  const { t: tr } = useLocale();
  const [step, setStep] = useState<"choose" | "confirm-delete">("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => {
    if (busy) return;
    setStep("choose");
    setError("");
    onClose();
  };
  async function revoke(deletePhotos: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await revokePhotoConsent(clientId, deletePhotos, portalToken);
      if (!result.ok) setError(result.message);
      else {
        setStep("choose");
        await onDone(result.state, result.message);
      }
    } catch {
      setError("تعذر الاتصال. لم نتأكد من الإيقاف؛ حدّث الصفحة وتحقق.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={close} title={tr("إيقاف صور التقدم")}>
      {step === "choose" ? (
        <>
          <p className="text-sm leading-7">{tr("بنوقف رفع صور جديدة. تبي نحذف الصور السابقة كمان؟")}</p>
          <div className="mt-4 grid gap-2">
            <button type="button" className="btn-secondary justify-start" disabled={busy} onClick={() => void revoke(false)}>
              {tr("الاحتفاظ بالسابق ووقف الرفع الجديد")}
            </button>
            <button type="button" className="btn-secondary justify-start text-danger" disabled={busy} onClick={() => setStep("confirm-delete")}>
              <Trash2 size={16} aria-hidden="true" />{tr("حذف كل الصور السابقة")}
            </button>
            <button type="button" className="btn-secondary justify-start" disabled={busy} onClick={close}>
              {tr("إلغاء")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-7">{tr("متأكد؟ بنحذف كل صور التقدم السابقة نهائيًا من حسابك ومن التخزين، وما نقدر نرجعها.")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void revoke(true)}>
              <Trash2 size={16} aria-hidden="true" />{tr(busy ? "جارٍ الحذف…" : "نعم، احذف الكل")}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setStep("choose")}>{tr("رجوع")}</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={close}>{tr("إلغاء")}</button>
          </div>
        </>
      )}
      {error && <p role="alert" className="field-error mt-3">{tr(error)}</p>}
    </Modal>
  );
}
