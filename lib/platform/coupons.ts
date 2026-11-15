import "server-only";
import { billingCall } from "./billing-store";
import type { PaidPlan } from "./plans";

export type CouponQuote = {
  coupon_code: string; coupon_percent: number; regular_total_halalas: number;
  total_halalas: number; vat_halalas: number; coupon_discount_halalas: number;
  minimum_applied: boolean; minimum_total_halalas: number;
};
export async function quoteCoupon(owner: string, plan: PaidPlan, code: string) {
  return billingCall<CouponQuote>("ec_billing_coupon_quote", { owner, plan_code: plan, coupon_code: code });
}
