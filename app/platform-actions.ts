"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rpc, readableError, requireCoachIdentity, actor, isSessionExpired } from "@/lib/server";
import { isPaidPlan } from "@/lib/platform/plans";
import { startPlatformTrial } from "@/lib/platform/server";
import type { Result } from "./actions";
import { draftContent, id } from "@/lib/model";

export async function selectPlatformResources(input: unknown): Promise<Result> {
  try {
    await requireCoachIdentity();
    const parsed = z.object({ clients: z.array(z.uuid()).max(10000), templates: z.array(z.uuid()).max(10000) }).parse(input);
    await rpc("ec_select_resources", parsed);
    revalidatePath("/", "layout");
    return { ok: true, message: "تم حفظ الاختيار. بقيت السجلات الأخرى محفوظة ومقفلة." };
  } catch (error) { return { ok: false, message: readableError(error) }; }
}

export async function platformResourcePage(afterClient:string|null,afterTemplate:string|null) {
  await requireCoachIdentity();
  return rpc<{clients:{id:string;name:string}[];templates:{id:string;name:string}[];next_client:string|null;next_template:string|null}>("ec_resource_options",{
    after_client:z.uuid().nullable().parse(afterClient),after_template:z.uuid().nullable().parse(afterTemplate),
  });
}

export async function saveTeamProgram(owner:string,input:unknown):Promise<Result> {
  try {
    await requireCoachIdentity();
    const value=z.object({client_id:id,name:z.string().trim().min(2).max(140),content:draftContent,expected_draft_id:id.nullable(),expected_edit_revision:z.number().int().positive().nullable()}).parse(input);
    const data=await rpc("ec_team_program_save",{owner:id.parse(owner),target:value.client_id,program_name:value.name,body:value.content,expected_id:value.expected_draft_id,expected_revision:value.expected_edit_revision});
    revalidatePath("/", "layout");return {ok:true,message:"تم حفظ مسودة الفريق",data};
  }catch(error){return {ok:false,message:readableError(error)};}
}
export async function publishTeamProgram(owner:string,program:string,revision:number):Promise<Result> {
  try {
    await requireCoachIdentity();
    const data=await rpc("ec_team_program_publish",{owner:id.parse(owner),program:id.parse(program),expected_revision:z.number().int().positive().parse(revision)});
    revalidatePath("/", "layout");return {ok:true,message:"تم نشر برنامج الفريق",data};
  }catch(error){return {ok:false,message:readableError(error)};}
}


/** Starts the signed-in owner's card-less free trial for the chosen paid plan, then opens the workspace. */
export async function startTrialAction(form: FormData) {
  const plan = String(form.get("plan") ?? "");
  const back = isPaidPlan(plan) ? `/start?plan=${plan}` : "/start";
  if (!isPaidPlan(plan)) redirect("/start?error=plan");
  if (!(await actor())) redirect(`/login?register=1&next=${encodeURIComponent(back)}`);
  let failure: string | null = null;
  try {
    await startPlatformTrial(plan);
  } catch (error) {
    if (isSessionExpired(error)) redirect(`/login?next=${encodeURIComponent(back)}`);
    failure = error instanceof Error ? error.message : "تعذر بدء التجربة";
  }
  if (failure) redirect(`${back}&error=${encodeURIComponent(failure.slice(0, 160))}`);
  revalidatePath("/", "layout");
  redirect("/coach?trial=started");
}
