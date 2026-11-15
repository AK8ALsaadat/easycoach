import "server-only";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { localMode,localGuard } from "@/lib/server";
import { getLocalDatabase } from "@/lib/local-db";
import { adminSupportClient } from "@/lib/supabase/admin";
import { ATTRIBUTION_COOKIE,readAttributionCookie,type Attribution } from "./attribution";
export const SIGNUP_RECEIPT_COOKIE="ec_signup_pixel_receipt";
export const receiptHash=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function analyticsCall<T>(name:string,args:Record<string,unknown>):Promise<T>{
 if(!/^ec_analytics_[a-z_]+$/.test(name))throw Error("Invalid analytics operation");
 if(localMode()){
  await localGuard();const entries=Object.entries(args);
  return(await(await getLocalDatabase()).query<{r:T}>(`select public.${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) as r`,entries.map(([,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].r;
 }
 const {data,error}=await adminSupportClient().rpc(name,args);
 if(error)throw Error("Analytics storage unavailable");return data as T;
}
export async function signupAttribution():Promise<Attribution>{
 try{return readAttributionCookie((await cookies()).get(ATTRIBUTION_COOKIE)?.value);}catch{return {};}
}
export async function issueSignupPixelReceipt(userId:string){
 if(!process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID)return;
 try{
  const token=randomBytes(32).toString("hex");
  const issued=await analyticsCall<boolean>("ec_analytics_issue_receipt",{owner:userId,token_hash:receiptHash(token)});
  if(issued)(await cookies()).set(SIGNUP_RECEIPT_COOKIE,token,{httpOnly:true,secure:process.env.APP_URL?.startsWith("https://")??false,sameSite:"lax",path:"/api/analytics/events",maxAge:86400});
 }catch{console.error("analytics.signup_receipt_unavailable");}
}
export async function attachGoogleAttribution(userId:string){
 try{await analyticsCall("ec_analytics_attach_attribution",{owner:userId,attributes:await signupAttribution()});}
 catch{console.error("analytics.signup_attribution_unavailable");}
}
