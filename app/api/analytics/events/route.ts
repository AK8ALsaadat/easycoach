import { cookies } from "next/headers";
import { actor } from "@/lib/server";
import { analyticsCall,SIGNUP_RECEIPT_COOKIE,receiptHash } from "@/lib/analytics/server";
import { validPixelId,type PixelEvent } from "@/lib/analytics/tiktok";
export async function POST(request:Request){
 const headers={"Cache-Control":"private, no-store"};
 const origin=request.headers.get("origin"),host=request.headers.get("x-forwarded-host")??request.headers.get("host");
 try{if(!origin||new URL(origin).host!==host)return Response.json({events:[]},{status:403,headers});}catch{return Response.json({events:[]},{status:403,headers});}
 if(!validPixelId(process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID))return Response.json({events:[]},{headers});
 try{
  const user=await actor(),jar=await cookies(),receipt=jar.get(SIGNUP_RECEIPT_COOKIE)?.value;
  const hash=receipt&&/^[a-f0-9]{64}$/.test(receipt)?receiptHash(receipt):null;
  if(!user&&!hash)return Response.json({events:[]},{headers});
  const events=await analyticsCall<PixelEvent[]>("ec_analytics_claim",{owner:user?.id??null,receipt_hash:hash});
  if(receipt)jar.delete({name:SIGNUP_RECEIPT_COOKIE,path:"/api/analytics/events"});
  return Response.json({events},{headers});
 }catch{return Response.json({events:[]},{status:503,headers});}
}
