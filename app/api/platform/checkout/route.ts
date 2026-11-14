import { actor } from "@/lib/server";
import { platformProviderReady } from "@/lib/platform/server";
/** Kept separate from /api/payments/paylink/checkout (trainee invoices).
 * No invoice creation, card collection, or trial activation until verified. */
export async function POST() {
  if(!await actor()) return Response.json({error:"Unauthorized"},{status:401});
  if(!platformProviderReady()) return Response.json({error:"رحلة بطاقة اشتراك EasyCoach غير متاحة حتى اكتمال التحقق من Paylink",code:"provider_not_verified"},{status:503});
  return Response.json({error:"Provider adapter unavailable"},{status:503});
}
