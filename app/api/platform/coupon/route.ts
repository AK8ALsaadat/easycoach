import { actor } from "@/lib/server";
import { quoteCoupon } from "@/lib/platform/coupons";
import { z } from "zod";

const Body = z.object({ plan: z.enum(["starter", "pro", "business"]), coupon: z.string().trim().min(1).max(32) }).strict();
export async function POST(request: Request) {
  const user = await actor();
  if (!user) return Response.json({ error: "يلزم تسجيل الدخول" }, { status: 401 });
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try { if (new URL(request.headers.get("origin") ?? "").host !== host) throw Error(); }
  catch { return Response.json({ error: "طلب غير مسموح" }, { status: 403 }); }
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "أدخل كوبونًا صالحًا." }, { status: 400 });
  try {
    const quote = await quoteCoupon(user.id, body.data.plan, body.data.coupon);
    return Response.json({ quote }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const invalid = error instanceof Error && error.message === "coupon_invalid";
    return Response.json({ error: invalid ? "الكوبون غير صالح أو انتهت صلاحيته." : "تعذّر تطبيق الكوبون. حاول مجددًا." }, { status: invalid ? 400 : 503 });
  }
}
