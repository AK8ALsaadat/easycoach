"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { id } from "@/lib/model";
import { managementCommands } from "@/lib/management";
import { readableError, rpc } from "@/lib/server";
import { cleanPendingPhotos } from "@/lib/photo-cleanup";
import type { Result } from "./actions";

export type PurgeSummary = { programs: number; weights: number; photos: number; messages: number; subscriptions: number; records: number };

/** Archive (default, reversible) or restore. The database checks ownership. */
export async function setClientArchived(clientId: string, archived: boolean, reason?: string): Promise<Result> {
  try {
    const payload = managementCommands.client_archive.parse({ client_id: clientId, archived, ...(reason?.trim() ? { reason } : {}) });
    const data = await rpc("management_command", { command: "client_archive", payload });
    revalidatePath("/", "layout");
    return { ok: true, message: archived ? "تمت أرشفة المتدرب" : "تمت استعادة المتدرب", data };
  } catch (error) {
    return { ok: false, message: readableError(error) };
  }
}

export async function clientPurgeSummary(clientId: string): Promise<{ ok: true; summary: PurgeSummary } | { ok: false; message: string }> {
  try {
    const summary = await rpc<PurgeSummary | null>("client_purge_summary", { target: id.parse(clientId) });
    if (!summary) throw Error("المتدرب غير متاح");
    return { ok: true, summary };
  } catch (error) {
    return { ok: false, message: readableError(error) };
  }
}

/** Permanent deletion: archived trainees only, with the exact name typed again. */
export async function purgeClient(clientId: string, confirmName: string): Promise<Result> {
  try {
    const input = z.object({ target: id, confirm_name: z.string().trim().min(1, "اكتب اسم المتدرب للتأكيد").max(120) }).parse({ target: clientId, confirm_name: confirmName });
    const data = await rpc("client_purge", input);
    revalidatePath("/", "layout");
    // Progress photo rows are gone; remove their private files now (retryable from settings).
    try {
      const cleanup = await cleanPendingPhotos();
      if (cleanup.pending)
        return { ok: true, message: "تم حذف المتدرب نهائيًا. بعض ملفات الصور بانتظار إعادة محاولة الحذف من الإعدادات.", data };
    } catch {
      return { ok: true, message: "تم حذف المتدرب نهائيًا. تحقق من حذف ملفات الصور المعلّقة عبر الإعدادات.", data };
    }
    return { ok: true, message: "تم حذف المتدرب وكل بياناته نهائيًا", data };
  } catch (error) {
    return { ok: false, message: readableError(error) };
  }
}
