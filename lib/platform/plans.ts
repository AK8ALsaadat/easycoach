/** Public presentation only. SQL ec_plans is the authority for enforcement and quotes. */
export const planCodes = ["free", "starter", "pro", "business"] as const;
export type PlanCode = typeof planCodes[number];
export const plans = {
  free: { name: "المجانية", features: ["ملفات المتدربين وباقات الحصص والحضور", "رابط الرصيد والحضور", "لوحة تحكم بسيطة"] },
  starter: { name: "الأساسية", features: ["مكتبة التمارين والبرامج المخصصة", "قوالب خاصة قابلة لإعادة الاستخدام ضمن حد الباقة", "الوزن والقياسات والتقدم", "استيراد Excel وCSV مع المعاينة"] },
  pro: { name: "الاحترافية", features: ["جميع ميزات الأساسية", "قوالب خاصة غير محدودة", "توزيع المتدربين على الفريق", "تسجيل إنجاز التمارين ومتابعة الالتزام", "تصدير البيانات وهوية بوابة المتدرب"] },
  business: { name: "الأعمال", features: ["جميع ميزات الاحترافية", "متدربون نشطون غير محدودين دون حد تجاري مخفي", "فروع ومديرو فروع بصلاحيات مقيدة", "مهام متابعة وأتمتة وإجراءات جماعية", "سجل أنشطة الفريق"] },
} as const;
export function isPlan(value: unknown): value is PlanCode { return planCodes.includes(value as PlanCode); }
export function sar(halalas: number) { return (halalas / 100).toFixed(2); }
export type Campaign = { enabled: boolean; starts_at: string | null; ends_at: string | null };
export function campaignActive(campaign: Campaign, now: number) {
  if (!campaign.enabled || !campaign.starts_at || !campaign.ends_at) return false;
  const start = Date.parse(campaign.starts_at), end = Date.parse(campaign.ends_at);
  return Number.isFinite(start) && Number.isFinite(end) && start < end && start <= now && now < end;
}
export function discountedPrice(halalas: number) {
  if (!Number.isSafeInteger(halalas) || halalas < 0) throw new Error("Invalid money");
  return Number((BigInt(halalas) * 80n + 50n) / 100n);
}
export type PlatformState = {
  subscription_state?: SubscriptionState;
  lifecycle_enabled?: boolean;
  paid_until?: string | null;
  grace_ends_at?: string | null;
  cancelled_at?: string | null;
  billing_mobile?: string | null;
  mode: "legacy" | "managed"; status: "free" | "trialing" | "active" | "past_due" | "expired";
  billing_plan: PlanCode; effective_plan: PlanCode; cancel_at_period_end: boolean;
  trial_end: string | null; period_start?: string | null; period_end: string | null; trial_used_at: string | null; has_payment_method?: boolean;
  locked_price_halalas: number | null; total_halalas: number | null; currency: "SAR";
  usage: { clients: number; templates: number; coaches: number };
  limits: { clients: number | null; templates: number | null; coaches: number };
  billing_limits: { clients: number | null; templates: number | null; coaches: number };
  locked_clients: string[] | null; locked_templates: string[] | null;
  features: string[]; server_now: string;
};
export enum SubscriptionState {
  NOT_STARTED="NOT_STARTED", TRIAL_ACTIVE="TRIAL_ACTIVE", TRIAL_ENDING="TRIAL_ENDING", AWAITING_PAYMENT="AWAITING_PAYMENT",
  ACTIVE="ACTIVE", PAST_DUE="PAST_DUE", SUSPENDED="SUSPENDED", CANCELLED="CANCELLED", PAYMENT_FAILED="PAYMENT_FAILED",
  PROVIDER_NOT_READY="PROVIDER_NOT_READY", TAX_NOT_CONFIGURED="TAX_NOT_CONFIGURED",
}
export type PlatformQuote = {
  limits: PlatformState["limits"];
  plan: PlanCode; base_halalas: number; net_halalas: number; vat_halalas: number | null;
  total_halalas: number | null; tax_mode: string; discount: boolean; campaign_active: boolean; trial_available: boolean;
  trial_campaign_active: boolean; trial_campaign_end: string | null; trial_days: number; trial_used: boolean;
  provider_ready: boolean; server_now: string;
};
export const TRIAL_DAYS = 14;
export const paidPlans = ["starter", "pro", "business"] as const;
export type PaidPlan = typeof paidPlans[number];
export function canPayPlatform(state: PlatformState) {
  return state.mode === "managed" && !state.cancelled_at && (!state.period_end || Date.parse(state.period_end) <= Date.parse(state.server_now) + 5 * 86400000);
}
export function isPaidPlan(value: unknown): value is PaidPlan { return paidPlans.includes(value as PaidPlan); }
/** Monthly price for display: whole riyals when exact ("299"), otherwise two decimals. */
export function riyals(halalas: number) { return sar(halalas); }
export function riyadhDate(iso: string, style: "long" | "medium" = "long") {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: style, timeZone: "Asia/Riyadh" }).format(new Date(iso));
}
export function limitLabel(limits: PlatformState["limits"]) {
  return [
    limits.clients === null ? "متدربون نشطون بلا حد" : `حتى ${limits.clients} متدربًا نشطًا`,
    limits.coaches === 1 ? "حساب مدرب واحد" : `${limits.coaches} حسابات مدربين شاملة المالك`,
    limits.templates === null ? "قوالب خاصة بلا حد" : limits.templates === 0 ? "بدون قوالب خاصة" : `${limits.templates} قوالب خاصة`,
  ];
}
