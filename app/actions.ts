"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { commands, type Command, email, phone, id } from "@/lib/model";
import {
  actor,
  hash,
  localMode,
  loginLocal,
  readableError,
  rpc,
  safeNext,
  snapshot,
  supabase,
} from "@/lib/server";
import { getLocalDatabase } from "@/lib/local-db";
import { cleanPendingPhotos } from "@/lib/photo-cleanup";

export type Result = {
  ok: boolean;
  message: string;
  data?: unknown;
  url?: string;
};
export async function mutate(
  command: Command,
  payload: unknown,
): Promise<Result> {
  try {
    if (!Object.hasOwn(commands, command)) throw new Error("عملية غير صالحة");
    const parsed = commands[command].safeParse(payload);
    if (!parsed.success)
      return {
        ok: false,
        message: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" · ")
          .slice(0, 300),
      };
    // Reject duplicate emails inside an import even if the request bypasses the preview UI.
    if (command === "import_clients") {
      const rows = (parsed.data as { rows: { email: string }[] }).rows;
      if (new Set(rows.map((r) => r.email)).size !== rows.length)
        throw new Error("يوجد إيميل مكرر داخل الملف");
    }
    const data = await rpc("app_command", { command, payload: parsed.data });
    revalidatePath("/", "layout");
    if (command === "privacy_fulfill") {
      try {
        const cleanup = await cleanPendingPhotos();
        if (cleanup.pending)
          return {
            ok: true,
            message:
              "تم حفظ طلب الحذف. بعض ملفات الصور بانتظار إعادة محاولة الحذف من الإعدادات.",
            data,
          };
      } catch {
        return {
          ok: true,
          message:
            "تم تنفيذ الطلب. تحقق من حذف ملفات الصور المعلّقة عبر الإعدادات.",
          data,
        };
      }
    }
    return { ok: true, message: "تم الحفظ", data };
  } catch (e) {
    return { ok: false, message: readableError(e) };
  }
}
export async function createLink(
  kind: "invite" | "join",
  clientId?: string,
): Promise<Result> {
  const token = randomBytes(32).toString("hex");
  const result = await mutate(
    kind === "invite" ? "invite_create" : "join_link_create",
    kind === "invite"
      ? { client_id: id.parse(clientId), token_hash: hash(token) }
      : { token_hash: hash(token) },
  );
  if (!result.ok) return result;
  return {
    ...result,
    url: `${process.env.APP_URL ?? "http://127.0.0.1:3200"}/${kind}/${token}`,
    message: "الرابط جاهز. شاركه بنفسك مع المستلم المقصود.",
  };
}
export async function loginAction(form: FormData): Promise<Result> {
  let target = "/coach";
  try {
    const input = z
      .object({ email, password: z.string().min(8).max(128) })
      .parse(Object.fromEntries(form));
    if (localMode()) await loginLocal(input.email, input.password);
    else {
      const { error } = await (await supabase()).auth.signInWithPassword(input);
      if (error) throw new Error("تعذر الدخول. تحقق من بياناتك وتأكيد الإيميل");
    }
    const data = await snapshot();
    target =
      data.profile?.role === "coach" ? safeNext(form.get("next")) : "/me";
    if (
      typeof form.get("next") === "string" &&
      String(form.get("next")).startsWith("/invite/")
    )
      target = safeNext(form.get("next"));
  } catch (e) {
    return { ok: false, message: readableError(e) };
  }
  redirect(target);
}
export async function registerAction(form: FormData): Promise<Result> {
  try {
    if (localMode())
      throw new Error(
        "استخدم الحسابات الاصطناعية الموضحة في المعاينة. التسجيل الحقيقي يعمل مع Supabase",
      );
    const input = z
      .object({
        name: z.string().min(2).max(120),
        email,
        password: z.string().min(12).max(128),
        role: z.enum(["coach", "trainee"]),
      })
      .parse(Object.fromEntries(form));
    const { error } = await (
      await supabase()
    ).auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: `${process.env.APP_URL}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}`,
        data: { display_name: input.name, role: input.role },
      },
    });
    if (error)
      throw new Error("تعذر إنشاء الحساب. تحقق من البيانات أو جرّب الدخول");
    return {
      ok: true,
      message:
        "تحقق من رسالة تأكيد الإيميل، ثم سجّل الدخول. الدعوة تتطلب نفس الإيميل الموثّق.",
    };
  } catch (e) {
    return { ok: false, message: readableError(e) };
  }
}
export async function magicLinkAction(form: FormData): Promise<Result> {
  try {
    if (localMode())
      throw new Error(
        "استخدم كلمة مرور حساب المعاينة. روابط الإيميل تعمل مع Supabase فقط",
      );
    const contact = email.parse(form.get("email"));
    const next = safeNext(form.get("next"));
    const { error } = await (
      await supabase()
    ).auth.signInWithOtp({
      email: contact,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${process.env.APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error?.status === 429)
      throw new Error("طلبات كثيرة. انتظر قليلًا قبل إعادة المحاولة");
    return {
      ok: true,
      message:
        "إذا كان الحساب مسجلًا، سيصلك رابط الدخول على الإيميل. لا تشاركه مع أحد.",
    };
  } catch (e) {
    return { ok: false, message: readableError(e) };
  }
}
export async function logoutAction() {
  if (localMode()) {
    const jar = await cookies();
    const token = jar.get("ec_session")?.value;
    if (token)
      await (
        await getLocalDatabase()
      ).query("delete from private.local_sessions where token_hash=$1", [
        hash(token),
      ]);
    jar.delete("ec_session");
  } else await (await supabase()).auth.signOut({ scope: "local" });
  redirect("/login");
}
export async function requestJoinAction(
  token: string,
  form: FormData,
): Promise<Result> {
  try {
    z.string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(token);
    const p = z
      .object({ name: z.string().min(2).max(120), email, phone })
      .parse(Object.fromEntries(form));
    await rpc(
      "request_join",
      {
        token: hash(token),
        display_name: p.name,
        contact_email: p.email,
        contact_phone: p.phone,
      },
      true,
    );
    return {
      ok: true,
      message:
        "استُلم الطلب إن لم يكن موجودًا. ينتظر موافقة المدرب؛ لا يمنح وصولًا تلقائيًا.",
    };
  } catch (e) {
    return { ok: false, message: readableError(e) };
  }
}
export async function claimAction(token: string): Promise<Result> {
  try {
    if (!(await actor()))
      throw new Error("سجّل الدخول أولًا بنفس إيميل الدعوة");
    z.string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(token);
    await rpc("claim_invite", { token: hash(token) });
    revalidatePath("/", "layout");
    return { ok: true, message: "تم ربط الحساب. افتح بوابة المتدرب." };
  } catch (e) {
    return { ok: false, message: readableError(e) };
  }
}
