import { NextRequest } from "next/server";
import { actor, localMode } from "@/lib/server";
import { adminSupportClient } from "@/lib/supabase/admin";
import { getLocalDatabase } from "@/lib/local-db";
import { z } from "zod";
import { readLimitedBody, RequestBodyTooLarge } from "@/lib/request-body";

export async function PATCH(request: NextRequest, {params}:{params:Promise<{id:string}>}) {
 const user=await actor(); if(!user||!process.env.SUPPORT_OWNER_USER_ID||user.id!==process.env.SUPPORT_OWNER_USER_ID)return Response.json({error:"غير مصرح"},{status:403,headers:{"Cache-Control":"no-store"}});
 if(request.headers.get("origin")!==new URL(process.env.APP_URL??request.url).origin)return Response.json({error:"طلب غير صالح"},{status:403});
 try {
  const id=z.uuid().parse((await params).id);
  const bytes=await readLimitedBody(request,1024);
  const {status}=z.object({status:z.enum(["open","in_progress","resolved","closed"])}).strict().parse(JSON.parse(new TextDecoder().decode(bytes)));
  if(localMode()){const db=await getLocalDatabase();await db.query("update public.support_tickets set status=$1,updated_at=now() where id=$2",[status,id]);}
  else {const {error}=await adminSupportClient().from("support_tickets").update({status,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;}
  return Response.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  const status=error instanceof RequestBodyTooLarge?413:error instanceof z.ZodError||error instanceof SyntaxError?400:500;
  return Response.json({error:status===413?"حجم الطلب أكبر من المسموح":status===400?"تحقق من معرّف التذكرة والحالة":"تعذر تحديث التذكرة"},{status,headers:{"Cache-Control":"private, no-store"}});
 }
}
