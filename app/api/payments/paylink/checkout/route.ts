import { billingEnabled } from "@/lib/billing-mode";
/** Retired trainee collection endpoint. Paylink only bills platform subscriptions. */
export async function POST() {
  if (!billingEnabled()) return new Response(null, { status: 404 });
  return Response.json({ error: "تحصيل دفعات المتدربين عبر المنصة غير متاح. Paylink مخصص لاشتراك المدرب في EasyCoach." }, { status: 410 });
}
