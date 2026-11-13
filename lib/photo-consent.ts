/**
 * Progress-photo notice. When this text changes, bump the version here AND in a
 * new migration (private.photo_consent_version) so trainees are asked again.
 * Every statement must match how storage actually works (see the README):
 * private bucket, short signed URLs, server-side EXIF/GPS removal, deletion queue.
 */
export const PHOTO_CONSENT_VERSION = 1;

export type PhotoConsentStatus = "none" | "accepted" | "revoked" | "outdated";
export type PhotoConsentState = {
  client_id: string;
  status: PhotoConsentStatus;
  current_version: number;
  version: number | null;
  accepted_at: string | null;
  revoked_at: string | null;
};

export const canUploadPhotos = (state?: PhotoConsentState | null) => state?.status === "accepted";
/** Ask automatically after linking, and again when the notice text changed. Not after an explicit stop. */
export const shouldPromptConsent = (state?: PhotoConsentState | null) => !state || state.status === "none" || state.status === "outdated";

export const consentStatusLabel: Record<PhotoConsentStatus, string> = {
  accepted: "موافق",
  none: "لم يوافق بعد",
  revoked: "أوقف الموافقة",
  outdated: "بانتظار موافقته على النسخة الجديدة",
};

/** `{0}` is the coach's display name (kept as a placeholder so the text stays translatable). */
export function photoConsentPoints() {
  return [
    "الصور اللي ترفعها تنحفظ في حسابك في مساحة تخزين خاصة، وتشوفها أنت ومدربك {0} فقط، عشان يتابع تقدمك ويعدّل برنامجك.",
    "ما تظهر لأي متدرب ثاني، وما تنعرض للعامة، وما تُستخدم في إعلانات أو تسويق بدون موافقتك.",
    "نحذف بيانات الموقع (GPS) وبقية البيانات الوصفية من الصورة تلقائيًا أثناء معالجتها، قبل اعتمادها.",
    "تقدر تحذف أي صورة بنفسك في أي وقت، أو توقف صور التقدم وتحذف كل صورك من هنا، أو تطلب حذف بياناتك من خيار «طلب تصحيح أو حذف بياناتي».",
    "إذا أرشفك مدربك يتوقف وصولك وتبقى الصور محفوظة؛ وإذا طلبت حذف بياناتك أو حذف مدربك ملفك نهائيًا، تنحذف الصور من التخزين. التفاصيل في سياسة الخصوصية.",
    "رفع الصور اختياري، وتقدر تستخدم المنصة كاملة بدونها.",
  ];
}
export const photoConsentTip = "ننصحك تلبس ملابس رياضية مناسبة وتصوّر بنفس الإضاءة والزاوية كل مرة.";

const dismissKey = (clientId: string, version: number) => `ec_photo_consent_dismissed:${clientId}:v${version}`;
/** "مو الحين" is remembered per device so the notice does not nag on every visit. */
export function wasConsentDismissed(clientId: string, version = PHOTO_CONSENT_VERSION) {
  try {
    return window.localStorage.getItem(dismissKey(clientId, version)) === "1";
  } catch {
    return false;
  }
}
export function rememberConsentDismissed(clientId: string, version = PHOTO_CONSENT_VERSION) {
  try {
    window.localStorage.setItem(dismissKey(clientId, version), "1");
  } catch {
    /* Private mode or blocked storage: the notice may show again, which is safe. */
  }
}
