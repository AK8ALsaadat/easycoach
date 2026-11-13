"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { id, date } from "@/lib/model";
import { recordSchemas } from "@/lib/management";
import { rpc, readableError } from "@/lib/server";
import { resolvePortalCredential } from "@/lib/portal-credentials";
const inputSchema = z.object({
  command: z.enum(["edit", "delete", "review"]), client_id: id, id,
  kind: z.enum(["measurement", "checkin"]),
  expected_updated_at: z.string().datetime({ offset: true }),
  entry_date: date.optional(), payload: z.unknown().optional(),
}).strict();
export async function changeProgressRecord(input: unknown, portalReference?: string) {
  try {
    const parsed = inputSchema.parse(input);
    const credential = portalReference ? await resolvePortalCredential(portalReference) : null;
    const payload = parsed.command === "edit" ? recordSchemas[parsed.kind].parse(parsed.payload) : parsed.command === "review" ? z.object({ feedback: z.string().max(4000) }).strict().parse(parsed.payload) : null;
    const data = await rpc<{ error?: string }>("progress_record_change", {
      command: parsed.command, target_client: parsed.client_id, record_id: parsed.id,
      expected_updated_at: parsed.expected_updated_at, entry_date: parsed.entry_date ?? null,
      value: payload, portal_hash: credential?.key ?? null, proof: credential?.proof ?? null,
    }, Boolean(credential));
    if (data.error) throw Error(data.error);
    // The bearer portal refreshes its scoped snapshot through onUpdate. Only
    // invalidate account pages that display the change, not the entire layout.
    revalidatePath("/coach");
    revalidatePath("/coach/clients/" + parsed.client_id);
    revalidatePath("/me");
    return { ok: true, message: parsed.command === "delete" ? "تم حذف التحديث" : "تم حفظ التصحيح مع الاحتفاظ بإسناد السجل", data };
  } catch (error) { return { ok: false, message: readableError(error) }; }
}
