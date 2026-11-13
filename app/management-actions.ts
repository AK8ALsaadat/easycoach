"use server";
import { revalidatePath } from "next/cache";
import { managementCommands, recordInput } from "@/lib/management";
import { rpc, readableError } from "@/lib/server";
import type { Result } from "./actions";
import { z } from "zod";
import { resolvePortalCredential } from "@/lib/portal-credentials";

export async function saveClientSchedule(payload: unknown): Promise<Result> {
  try {
    const input = z.object({ client_id: z.string().uuid(), weight_days: z.number().int().min(1).max(90), measurement_days: z.number().int().min(1).max(180), photo_days: z.number().int().min(1).max(180) }).strict().parse(payload);
    const data = await rpc("client_schedule_save", { payload: input });
    revalidatePath("/", "layout");
    return { ok: true, message: "تم حفظ مواعيد المتابعة", data };
  } catch (error) {
    return { ok: false, message: readableError(error) };
  }
}

export async function manage(
  command: keyof typeof managementCommands,
  payload: unknown,
): Promise<Result> {
  try {
    if (!Object.hasOwn(managementCommands, command))
      throw Error("عملية غير صالحة");
    const parsed = managementCommands[command].parse(payload);
    const data = await rpc("management_command", { command, payload: parsed });
    revalidatePath("/", "layout");
    return { ok: true, message: "تم الحفظ", data };
  } catch (error) {
    return { ok: false, message: readableError(error) };
  }
}

export async function portalManage(
  token: string,
  command: "record_save" | "messages_read",
  payload: unknown,
): Promise<Result> {
  try {
    const { key, proof } = await resolvePortalCredential(token);
    const parsed = command === "record_save" ? recordInput.parse(payload) : {};
    if (!["record_save", "messages_read"].includes(command))
      throw Error("عملية غير صالحة");
    const data = await rpc<{ error?: string }>(
      "portal_management",
      { token_hash: key, proof, command, payload: parsed },
      true,
    );
    if (data.error) throw Error(data.error);
    revalidatePath("/", "layout");
    return { ok: true, message: "تم الحفظ", data };
  } catch (error) {
    return { ok: false, message: readableError(error) };
  }
}
