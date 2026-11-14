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
import { arabicIssues } from "@/lib/form-errors";
import { registrationPasswordIssue } from "@/lib/password";
import { beginPendingSignup } from "@/lib/pending-signup";
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
        message: arabicIssues(parsed.error).slice(0, 300),
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
        password: z.string(),
        password_confirmation: z.string({ error: "أعد كتابة كلمة المرور للتأكيد" }),
        role: z.enum(["coach", "trainee"]),
      })
      .parse(Object.fromEntries(form));
    const passwordIssue = registrationPasswordIssue(input.password, input.password_confirmation);
    if (passwordIssue) return { ok: false, message: passwordIssue };
    const client = await supabase();
    const { data, error } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: `${process.env.APP_URL}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}`,
        data: { display_name: input.name, role: input.role },
      },
    });
    if (error) {
      // Vercel logs keep the real cause; the user gets an actionable message.
      console.error("signUp failed", error.status, error.code, error.message);
      if (error.status === 429 || error.code === "over_email_send_rate_limit")
        throw new Error("طلبات تسجيل كثيرة. انتظر قليلًا ثم حاول مرة أخرى.");
      if (error.code === "weak_password")
        throw new Error("كلمة المرور لا تحقق شروط الخادم. استخدم كلمة أطول وأعقد ثم أعد المحاولة.");
      if (error.code === "user_already_exists" || error.code === "email_exists")
        throw new Error("هذا البريد مسجل مسبقًا. سجل دخولك أو استخدم استعادة كلمة المرور.");
      if (/confirmation email|error sending/i.test(error.message))
        throw new Error("تعذر إرسال رسالة التأكيد لبريدك. حاول بعد قليل، وإذا استمرت المشكلة تواصل مع الدعم.");
      throw new Error("تعذر إنشاء الحساب. حاول مرة أخرى بعد قليل.");
    }
    // signUp's user is not proof of verification. Confirm email must stay enabled.
    if (data?.session) {
      await client.auth.signOut({ scope: "local" });
      return { ok: false, message: "تعذر بدء تأكيد البريد. حاول لاحقًا أو تواصل مع الدعم." };
    }
    await beginPendingSignup(input.email, form.get("next"));
    return {
      ok: true,
      message: "تحقق من بريدك وأدخل رمز تأكيد الحساب.",
      url: "/verify-email",
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
  } catch (e) {
    return { ok: false, message: readableError(e) };
  }
  revalidatePath("/", "layout");
  redirect("/me");
}
/** Google sign-in is shown only after the provider is configured in Supabase. */
const googleAuthEnabled = () =>
  !localMode() && process.env.AUTH_GOOGLE_ENABLED === "true";
const OAUTH_ROLE_COOKIE = "ec_oauth_role";
export async function googleLoginAction(input: {
  next?: string;
  role?: string;
}): Promise<Result> {
  try {
    if (!googleAuthEnabled())
      throw new Error("الدخول بحساب Google غير مفعّل حاليًا");
    const next = safeNext(input.next);
    const role = z.enum(["coach", "trainee"]).parse(
      input.role ?? (next.startsWith("/invite/") ? "trainee" : "coach"),
    );
    // Applied only to brand-new accounts in /auth/callback; existing roles never change.
    (await cookies()).set(OAUTH_ROLE_COOKIE, role, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_URL?.startsWith("https://") ?? false,
      maxAge: 600,
      path: "/auth/callback",
    });
    const { data, error } = await (
      await supabase()
    ).auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${process.env.APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url) throw new Error("تعذر فتح الدخول بحساب Google");
    return { ok: true, message: "", url: data.url };
  } catch (e) {
    return { ok: false, message: readableError(e) };
  }
}
