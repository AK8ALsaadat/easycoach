import { readFile } from "node:fs/promises";
import path from "node:path";
import { actor, localMode, rpc } from "@/lib/server";
import { getLocalDatabase } from "@/lib/local-db";
import { adminSupportClient } from "@/lib/supabase/admin";
import { validPhoto } from "@/lib/progress-photos";
import { supportAttachmentFilename } from "@/lib/support-attachment-path";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow"};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const user=await actor(); if(!user)return new Response(null,{status:401,headers});const {id}=await params;
 try {
  let ticket:{id:string;attachment_path:string|null}|undefined;
  if(localMode()){const db=await getLocalDatabase();const r=await db.query<{id:string;attachment_path:string|null}>("select id,attachment_path from public.support_tickets where id=$1 and (author_id=$2 or $3=true)",[id,user.id,Boolean(process.env.SUPPORT_OWNER_USER_ID&&user.id===process.env.SUPPORT_OWNER_USER_ID)]);ticket=r.rows[0];}
  else if(process.env.SUPPORT_OWNER_USER_ID===user.id){const r=await adminSupportClient().from("support_tickets").select("id,attachment_path").eq("id",id).maybeSingle();ticket=r.data??undefined;}
  else {ticket=((await rpc<unknown>("support_ticket_list")) as Array<{id:string;attachment_path:string|null}>).find(t=>t.id===id);}
  if(!ticket?.attachment_path)throw Error("not found");
  if(localMode()){const bytes=await readFile(path.join(process.cwd(),"data/support-attachments",supportAttachmentFilename(ticket.attachment_path)));if(!validPhoto(bytes,"image/jpeg")&&!validPhoto(bytes,"image/png")&&!validPhoto(bytes,"image/webp"))throw Error("bad image");const type=bytes[0]===255?"image/jpeg":Buffer.from(bytes.subarray(0,4)).toString()==="RIFF"?"image/webp":"image/png";return new Response(bytes,{headers:{...headers,"Content-Type":type}});}
  const {data,error}=await adminSupportClient().storage.from("support-attachments").createSignedUrl(ticket.attachment_path,60);if(error)throw error;return new Response(null,{status:302,headers:{...headers,Location:data.signedUrl,"Referrer-Policy":"no-referrer"}});
 }catch{return new Response(null,{status:404,headers});}
}
