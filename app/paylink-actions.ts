"use server";
import { z } from "zod";
import { requireCoach } from "@/lib/server";
import { createPaylinkClient, PaylinkError } from "@/lib/paylink/client";
import { newWebhookSecret, sealAccount, sealingConfigured } from "@/lib/paylink/seal";
import { accountFor, appUrl, paylinkBaseUrl, paylinkLog, paylinkTestMode } from "@/lib/paylink/service";
import { paylinkStore } from "@/lib/paylink/store";
import type { Result } from "./actions";

export type PaylinkStatus = {
  available: boolean;
  connected: boolean;
  source: "env" | "account" | null;
  testMode: boolean;
  webhookUrl: string;
  webhookSecret: string | null;
};

async function coachId() {
  const data = await requireCoach();
  return data.profile!.id;
}

export async function paylinkStatus(): Promise<PaylinkStatus> {
  const id = await coachId();
  const account = await accountFor(id).catch(() => null);
  return {
    available: Boolean(paylinkBaseUrl()) && (sealingConfigured() || account?.source === "env"),
    connected: Boolean(account),
    source: account?.source ?? null,
    testMode: paylinkTestMode(),
    webhookUrl: `${appUrl()}/api/payments/paylink/webhook`,
    // The coach pastes this into their own Paylink dashboard. The env one is set by the owner.
    webhookSecret: account?.source === "account" ? account.webhookSecret : null,
  };
}

const Keys = z.object({
  apiId: z.string().trim().min(3, "اكتب API ID").max(200),
  secretKey: z.string().trim().min(8, "اكتب Secret Key").max(400),
});

export async function savePaylinkAccount(input: unknown): Promise<Result> {
  try {
    const id = await coachId();
    const keys = Keys.parse(input);
    const baseUrl = paylinkBaseUrl();
    if (!baseUrl || !sealingConfigured()) return { ok: false, message: "الدفع الإلكتروني غير مفعّل على المنصة بعد." };
    const current = await accountFor(id);
    if (current?.source === "env") return { ok: false, message: "حسابك مربوط من إعدادات الخادم، وما يحتاج مفاتيح هنا." };
    // Prove the keys work before storing them.
    await createPaylinkClient({ baseUrl, ...keys }).auth({ fresh: true });
    const sealed = sealAccount({ ...keys, webhookSecret: current?.webhookSecret ?? newWebhookSecret() }, id);
    await paylinkStore.accountPut(id, sealed);
    paylinkLog("paylink.account.saved", { coach: id });
    return { ok: true, message: "تم ربط حساب Paylink. أكمل خطوة الـ Webhook في لوحة Paylink." };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? "تحقق من المفاتيح" };
    if (error instanceof PaylinkError && error.code === "auth_failed")
      return { ok: false, message: paylinkTestMode() ? "رفضت Paylink المفاتيح. تأكد إنها مفاتيح بيئة التجربة." : "رفضت Paylink المفاتيح. تأكد من API ID و Secret Key." };
    paylinkLog("paylink.account.save_failed", { code: error instanceof PaylinkError ? error.code : "internal" });
    return { ok: false, message: "تعذّر الاتصال بـ Paylink الآن. حاول بعد دقائق." };
  }
}

export async function removePaylinkAccount(): Promise<Result> {
  try {
    const id = await coachId();
    await paylinkStore.accountPut(id, null);
    paylinkLog("paylink.account.removed", { coach: id });
    return { ok: true, message: "تم فصل حساب Paylink. زر الدفع اختفى من بوابة متدربينك." };
  } catch {
    return { ok: false, message: "تعذّر فصل الحساب. حاول مرة ثانية." };
  }
}
