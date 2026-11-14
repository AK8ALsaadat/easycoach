import { timingSafeEqual } from "node:crypto";
import { adminSupportClient } from "@/lib/supabase/admin";
export const runtime="nodejs";
export async function GET(request:Request) {
  const headers={"Cache-Control":"private, no-store"};
  const secret=process.env.CRON_SECRET;
  if(!secret || secret.length<32) return Response.json({error:"Subscription schedule not configured"},{status:503,headers});
  const expected=Buffer.from(`Bearer ${secret}`),given=Buffer.from(request.headers.get("authorization")??"");
  if(expected.length!==given.length || !timingSafeEqual(expected,given)) return Response.json({error:"Unauthorized"},{status:401,headers});
  const {data,error}=await adminSupportClient().rpc("ec_reconcile");
  if(error) return Response.json({error:"Subscription reconciliation failed"},{status:503,headers});
  const operations=await Promise.all([
    adminSupportClient().rpc("ec_run_automation"),
    adminSupportClient().rpc("ec_queue_reports"),
    adminSupportClient().rpc("ec_queue_package_expiry"),
  ]);
  if(operations.some(result=>result.error)) return Response.json({error:"Subscription reconciliation completed; organization maintenance needs retry"},{status:503,headers});
  return Response.json({subscriptions:data,automation:operations[0].data,reports:operations[1].data,expiryReminders:operations[2].data},{headers});
}
