import Link from "next/link";
import { notFound } from "next/navigation";
import { actor, hash, rpc } from "@/lib/server";
import { Brand } from "@/components/brand";
import { LinkForm } from "@/components/link-form";
export default async function PublicLink({
  params,
}: {
  params: Promise<{ kind: string; token: string }>;
}) {
  const { kind, token } = await params;
  if (!["join", "invite"].includes(kind) || !/^[a-f0-9]{64}$/.test(token))
    notFound();
  const info = await rpc<{ coach: string; email_hint?: string } | null>(
    "public_link_info",
    { token: hash(token), link_type: kind },
    true,
  );
  if (!info)
    return (
      <main className="empty min-h-screen">
        <h1>الرابط منتهي أو غير صالح</h1>
        <p>اطلب من المدرب دعوة جديدة. لا يمكن إعادة استخدام دعوة سبق قبولها.</p>
        <Link className="btn" href="/login">
          الدخول
        </Link>
      </main>
    );
  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <Brand />
      <section className="card mt-12 p-7">
        <p className="mb-3 text-sm text-teal">{info.coach}</p>
        <h1 className="text-2xl">
          {kind === "join" ? "اطلب الانضمام لمدربك" : "دعوتك إلى مساحة التدريب"}
        </h1>
        <p className="mt-3 mb-7 text-sm leading-8 text-muted">
          {kind === "join"
            ? "اكتب بيانات التواصل. يراجع المدرب طلبك قبل دعوتك."
            : `هذه الدعوة تخص إيميل ${info.email_hint}. يلزم حساب موثّق بنفس الإيميل؛ الرابط وحده لا يمنح الوصول.`}
        </p>
        <LinkForm
          token={token}
          kind={kind as "join" | "invite"}
          loggedIn={Boolean(await actor())}
        />
      </section>
    </main>
  );
}
