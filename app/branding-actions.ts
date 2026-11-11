"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach, rpc, readableError } from "@/lib/server";
import { prepareCoachAvatar } from "@/lib/coach-avatar";
import type { CoachBranding } from "@/lib/coach-branding";

export async function saveCoachBranding(form: FormData) {
  try {
    await requireCoach();
    const name = z.string().trim().max(120).refine(v => v.length !== 1, "اكتب اسمًا من حرفين على الأقل").parse(form.get("display_name"));
    const file = form.get("avatar");
    const remove = form.get("remove_avatar") === "true";
    const upload = file instanceof File && file.size > 0;
    if (remove && upload) throw Error("اختر صورة جديدة أو إزالة الصورة الحالية");
    const version = z.string().datetime({ offset: true }).nullable().parse(form.get("version") || null);
    const branding = await rpc<CoachBranding>("coach_branding_save", {
      display_name: name,
      change_avatar: remove || upload,
      avatar_data: upload ? await prepareCoachAvatar(file as File) : null,
      expected_version: version,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "تم حفظ هويتك لجميع متدربيك", branding };
  } catch (error) {
    return { ok: false, message: readableError(error) };
  }
}
