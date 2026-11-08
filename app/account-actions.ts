"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rpc, readableError } from "@/lib/server";
import { cleanPendingPhotos } from "@/lib/photo-cleanup";
export async function saveAccount(input: unknown) {
  try {
    await rpc("profile_update", {
      display_name: z.string().trim().min(2).max(120).parse(input),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "تم حفظ اسم الحساب" };
  } catch (error) {
    return { ok: false, message: readableError(error) };
  }
}
export async function retryPhotoCleanup() {
  try {
    const result = await cleanPendingPhotos();
    return {
      ok: result.pending === 0,
      message: result.pending
        ? `تبقى ${result.pending} صورة بانتظار حذف الملف؛ أعد المحاولة`
        : `اكتمل حذف ملفات الصور. تمت إزالة ${result.removed} ملف`,
    };
  } catch (error) {
    return { ok: false, message: readableError(error) };
  }
}
