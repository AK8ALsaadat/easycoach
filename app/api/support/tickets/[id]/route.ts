import { NextRequest } from "next/server";
import { actor, localMode } from "@/lib/server";
import { adminSupportClient } from "@/lib/supabase/admin";
import { getLocalDatabase } from "@/lib/local-db";

export async function PATCH(request: NextRequest, {params}:{params:Promise<{id:string}>}) {
 const user=await actor(); if(!user||!process.env.SUPPORT_OWNER_USER_ID||user.id!==process.env.SUPPORT_OWNER_USER_ID)return Response.json({error:"غير مصرح"},{status:403,headers:{"Cache-Control":"no-store"}});
 if(request.headers.get("origin")!==new URL(process.env.APP_URL??request.url).origin)return Response.json({error:"طلب غير صالح"},{status:403});
 const {id}=await params; const {status}=await request.json(); if(!["open","in_progress","resolved","closed"].includes(status))return Response.json({error:"حالة غير صالحة"},{status:400});
 try { if(localMode()){const db=await getLocalDatabase();await db.query("update public.support_tickets set status=$1,updated_at=now() where id=$2",[status,id]);}else {const {error}=await adminSupportClient().from("support_tickets").update({status,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;} return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});}catch{return Response.json({error:"تعذر تحديث التذكرة"},{status:500});}
}
