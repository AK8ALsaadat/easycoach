import { cookies } from "next/headers";
import { translator } from "@/lib/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import { actor, hash, rpc } from "@/lib/server";
import { Brand } from "@/components/brand";
import { LinkForm, SwitchAccount } from "@/components/link-form";
import { linkBranding } from "@/lib/coach-branding-server";
import { brandingPreview } from "@/lib/coach-branding";
import { CoachIdentity } from "@/components/coach-identity";
export async function generateMetadata({ params }: { params: Promise<{ kind: string; token: string }> }) {
  const { kind, token } = await params;
  return brandingPreview(await linkBranding(token, kind), process.env.APP_URL ?? "http://127.0.0.1:3200");
}
export default async function PublicLink({
  params,
}: {
  params: Promise<{ kind: string; token: string }>;
}) {
  const tr = translator(
    (await cookies()).get("ec_language")?.value === "en" ? "en" : "ar",
  );
  const { kind, token } = await params;
  if (!["join", "invite"].includes(kind) || !/^[a-f0-9]{64}$/.test(token))
    notFound();
  const info = await rpc<{ coach: string; email_hint?: string } | null>(
    "public_link_info",
    { token: hash(token), link_type: kind },
    true,
  );
  const user = await actor();
  if (!info)
    return (
      <main className="empty min-h-screen">
        <h1>{tr("الرابط منتهي أو غير صالح")}</h1>
        <p>
          {tr(
            "اطلب من المدرب دعوة جديدة. لا يمكن إعادة استخدام دعوة سبق قبولها.",
          )}
        </p>
        {user ? (
          <>
            <p className="text-sm text-muted">{tr("أنت مسجّل الدخول بإيميل")} <bdi dir="ltr">{user.email}</bdi></p>
            <SwitchAccount next={kind === "invite" ? `/invite/${token}` : undefined} label={tr("تسجيل الخروج والدخول بحساب آخر")} />
          </>
        ) : (
          <Link className="btn" href="/login">
            {tr("الدخول")}
          </Link>
        )}
      </main>
    );
  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <Brand />
      <section className="card mt-12 p-7">
        <CoachIdentity branding={await linkBranding(token, kind)} fallback={info.coach} />
        <h1 className="text-2xl">
          {kind === "join"
            ? tr("اطلب الانضمام لمدربك")
            : tr("دعوتك إلى مساحة التدريب")}
        </h1>
        <p className="mt-3 mb-7 text-sm leading-8 text-muted">
          {kind === "join"
            ? tr("اكتب بيانات التواصل. يراجع المدرب طلبك قبل دعوتك.")
            : tr(
                "هذه الدعوة تخص إيميل {0}. يلزم حساب موثّق بنفس الإيميل؛ الرابط وحده لا يمنح الوصول.",
                String(info.email_hint),
              )}
        </p>
        <LinkForm
          token={token}
          kind={kind as "join" | "invite"}
          loggedIn={Boolean(user)}
          currentEmail={user?.email}
        />
      </section>
    </main>
  );
}
