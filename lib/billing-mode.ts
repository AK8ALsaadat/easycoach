/** One server environment switch. No public environment variable or client override. */
export function billingEnabled() {
  return process.env.BILLING_ENABLED === "true";
}
export const FREE_PLATFORM_NOTICE = "المنصة مجانية لفترة محدودة";
