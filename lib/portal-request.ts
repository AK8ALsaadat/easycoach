import type { PortalData } from "./model";

export type PortalResponse = {
  ok: boolean;
  data?: PortalData;
  error?: string;
  accessDenied?: boolean;
};

// These are explicit authorization failures from the portal RPC. Validation
// failures and unavailable services must not discard an already-open draft.
export function portalFailure(error: string): PortalResponse {
  return {
    ok: false,
    error,
    accessDenied: [
      "أدخل رمز الدخول من مدربك",
      "الرابط غير متاح. اطلب رابطًا جديدًا من مدربك",
      "الرابط غير متاح",
      "رمز الدخول غير صحيح",
      "محاولات كثيرة. انتظر 15 دقيقة",
    ].includes(error),
  };
}

export async function requestPortal(
  request: () => Promise<PortalResponse>,
): Promise<PortalResponse> {
  try {
    return await request();
  } catch {
    return {
      ok: false,
      error: "تعذر الاتصال. بياناتك المدخلة ما زالت هنا؛ أعد المحاولة عند عودة الاتصال.",
    };
  }
}

export function portalDataAfterResponse(
  current: PortalData | null,
  response: PortalResponse,
) {
  if (response.ok && response.data) return response.data;
  return response.accessDenied ? null : current;
}
