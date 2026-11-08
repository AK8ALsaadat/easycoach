"use server";
import { redirect } from "next/navigation";
import { demoCredentials, DEMO_EMAIL, isDemoIdentity } from "@/lib/demo-config";
import { ensureLocalDemo, LOCAL_DEMO_PASSWORD } from "@/lib/local-demo";
import { getLocalDatabase } from "@/lib/local-db";
import { localMode, loginLocal, supabase, readableError } from "@/lib/server";
import type { Result } from "./actions";
export async function demoLogin(form: FormData): Promise<Result> {
  if (!demoCredentials.safeParse(Object.fromEntries(form)).success)
    return { ok: false, message: "بيانات الحساب التجريبي: test / test" };
  try {
    if (localMode()) {
      await ensureLocalDemo(await getLocalDatabase());
      await loginLocal(DEMO_EMAIL, LOCAL_DEMO_PASSWORD);
    } else {
      const password = process.env.DEMO_AUTH_PASSWORD;
      if (!password) throw Error("الحساب التجريبي غير مفعّل في هذه البيئة");
      const client = await supabase();
      const result = await client.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password,
      });
      if (result.error || !result.data.user)
        throw Error("تعذر فتح الحساب التجريبي. أعد المحاولة لاحقًا");
      if (
        !isDemoIdentity(result.data.user.email, result.data.user.app_metadata)
      ) {
        await client.auth.signOut();
        throw Error("إعداد الحساب التجريبي غير صالح");
      }
    }
  } catch (error) {
    return { ok: false, message: readableError(error) };
  }
  redirect("/coach");
}
