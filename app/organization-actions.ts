"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { rpc, requireCoachIdentity, readableError } from "@/lib/server";
import type { Result } from "./actions";
const uuid=z.uuid();const nullable=uuid.nullable().default(null);
const schemas={
  ec_brand_color:z.object({color:z.string().regex(/^#[0-9a-fA-F]{6}$/)}),
  ec_team_invite:z.object({email_address:z.email(),member_role:z.enum(["trainer","branch_manager"]),branch:nullable}),
  ec_team_accept:z.object({owner:uuid}),
  ec_team_deactivate:z.object({member:uuid}),
  ec_branch_save:z.object({branch:nullable,branch_name:z.string().trim().min(2).max(120),enabled:z.boolean().default(true)}),
  ec_assign_client:z.object({client:uuid,member:nullable,branch:nullable}),
  ec_task_save:z.object({owner:uuid,client:uuid,assignee:uuid,title:z.string().trim().min(2).max(200),due:z.iso.datetime(),task:nullable,done:z.boolean().default(false)}),
  ec_rule_save:z.object({rule:nullable,event_name:z.enum(["expiry","low_sessions","inactive"]),threshold_value:z.number().int().min(1).max(365),action_name:z.enum(["task","email","both"]),enabled:z.boolean().default(true)}),
  ec_bulk_preview:z.object({operation:z.enum(["assign","program","notify"]),body:z.object({clients:z.array(uuid).min(1).max(100),member:nullable,branch:nullable,template:nullable,message:z.string().max(2000).optional()})}),
  ec_bulk_apply:z.object({preview:uuid}),
  ec_schedule_report:z.object({first_run:z.iso.datetime(),every_days:z.number().int().min(1).max(30),enabled:z.boolean().default(true)}),
  ec_session_limit:z.object({subscription:uuid,sessions:z.number().int().min(1).max(10000)}),
  ec_attendance:z.object({subscription:uuid,attendance_id:uuid,attendance_date:z.iso.date()}),
} as const;
export type OrganizationOperation=keyof typeof schemas;
export async function organizationAction(operation:OrganizationOperation,input:unknown):Promise<Result> {
  try {
    await requireCoachIdentity();
    if(!Object.hasOwn(schemas,operation)) throw new Error("عملية غير مسموحة");
    const parsed=schemas[operation].parse(input);
    const data=await rpc(operation,parsed);
    revalidatePath("/", "layout");
    return {ok:true,message:operation==="ec_bulk_preview"?"راجع العملية ثم أكد تنفيذها":"تم الحفظ",data};
  } catch(error){return {ok:false,message:readableError(error)};}
}
