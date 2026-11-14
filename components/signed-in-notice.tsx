import Link from "next/link";
import { cookies } from "next/headers";
import { UserCheck } from "lucide-react";
import { Brand } from "./brand";
import { translator } from "@/lib/i18n";

/**
 * Shown when the login page is opened while a session is already active.
 * Signing in as someone else replaces the identity that every open tab reads
 * and writes with, so switching has to be a deliberate, visible step.
 */
export async function SignedInNotice({
  email,
  name,
  home,
  next,
}: {
  email: string;
  name: string;
  home: string;
  next?: string;
}) {
  const tr = translator((await cookies()).get("ec_language")?.value === "en" ? "en" : "ar");
  const switchHref = `/login?switch=1${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-5 py-10">
      <Brand />
      <section className="card mt-10 p-6">
        <h1 className="flex items-center gap-2 text-xl">
          <UserCheck size={20} />
          {tr("أنت مسجّل الدخول بالفعل")}
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted">
          {tr("هذا المتصفح مسجّل الدخول باسم")} <strong>{name}</strong> ({email}).{" "}
          {tr("الدخول بحساب ثاني يبدّل الحساب في كل التبويبات المفتوحة، وأي حفظ بعدها يروح للحساب الجديد.")}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link className="btn" href={home}>
            {tr("متابعة بهذا الحساب")}
          </Link>
          <Link className="btn-secondary" href="/logout">
            {tr("تسجيل الخروج ثم الدخول بحساب آخر")}
          </Link>
          <Link className="btn-soft" href={switchHref}>
            {tr("أعرف، أكمل الدخول بحساب آخر")}
          </Link>
        </div>
      </section>
    </main>
  );
}
