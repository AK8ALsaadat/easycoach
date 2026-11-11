import { expect, it } from "vitest";
import type { PortalData } from "@/lib/model";
import { portalDataAfterResponse, portalFailure, requestPortal } from "@/lib/portal-request";

const current: PortalData = {
  name: "متدرب اصطناعي",
  coach: "مدرب اصطناعي",
  program: null,
  weights: [],
  goal: null,
};

it("turns rejected action transport into a retryable failure and keeps the mounted portal data", async () => {
  const result = await requestPortal(() => Promise.reject(new TypeError("Failed to fetch")));
  expect(result.ok).toBe(false);
  expect(result.error).toContain("تعذر الاتصال");
  expect(result.accessDenied).not.toBe(true);
  expect(portalDataAfterResponse(current, result)).toBe(current);
});

it("keeps already-loaded data on a returned service failure or validation error", async () => {
  const outage = await requestPortal(async () => ({ ok: false, error: "لم تكتمل العملية. راجع المدخلات وحاول مرة أخرى." }));
  expect(portalDataAfterResponse(current, outage)).toBe(current);
  expect(portalDataAfterResponse(current, portalFailure("الوزن بين 20 و400 كجم"))).toBe(current);
  expect(portalDataAfterResponse(null, outage)).toBeNull();
});

it.each([
  "أدخل رمز الدخول من مدربك",
  "الرابط غير متاح. اطلب رابطًا جديدًا من مدربك",
  "الرابط غير متاح",
  "رمز الدخول غير صحيح",
  "محاولات كثيرة. انتظر 15 دقيقة",
])("clears private cached data when the server confirms access denial: %s", error => {
  const failure = portalFailure(error);
  expect(failure.accessDenied).toBe(true);
  expect(portalDataAfterResponse(current, failure)).toBeNull();
});

it("replaces cached data only with an actual successful portal response", async () => {
  const updated = { ...current, name: "سجل محدّث" };
  const result = await requestPortal(async () => ({ ok: true, data: updated }));
  expect(portalDataAfterResponse(current, result)).toBe(updated);
  expect(portalDataAfterResponse(current, { ok: true })).toBe(current);
});
