import Link from "next/link";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
import { localMode, safeNext } from "@/lib/server";
import { Check, Layers3, Users, Wallet } from "lucide-react";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col px-6 py-8 sm:px-16 lg:px-24">
        <Brand />
        <div className="my-auto w-full max-w-md self-center py-14">
          <p className="mb-3 text-sm font-medium text-teal">
            مرحبًا بك في إيزي كوتش
          </p>
          <h1 className="text-3xl">
            خطط أقوى.
            <br />
            نتائج تُتابَع.
          </h1>
          <p className="mt-3 mb-8 text-muted">
            كل عملائك وبرامجهم واشتراكاتهم، بوضوح وفي مكان واحد.
          </p>
          {params.error ? (
            <p className="mb-4 text-red-700">
              تعذر تأكيد الحساب. جرّب رابطًا جديدًا أو سجّل الدخول.
            </p>
          ) : null}
          <AuthForm next={safeNext(params.next)} local={localMode()} />
        </div>
        <Link href="/privacy" className="text-xs text-muted underline">
          إشعار الخصوصية · مسودة للمراجعة
        </Link>
      </section>
      <aside className="relative hidden overflow-hidden bg-ink p-16 text-white lg:flex lg:flex-col lg:justify-center">
        <div className="absolute -left-28 -top-32 size-[500px] rounded-full border-[60px] border-white/[.025]" />
        <p className="eyebrow !text-accent">
          إدارة احترافية. تجربة تدريب أفضل.
        </p>
        <h2 className="mt-6 max-w-lg text-4xl leading-[1.6] font-semibold">
          كل جولة محسوبة.
          <br />
          <span className="text-accent">وكل متدرب له خطته.</span>
        </h2>
        <div className="mt-12 grid max-w-lg gap-4">
          {[
            [Users, "الهدف والوزن ومسار التقدم"],
            [Layers3, "876 حركة. جدولك بتفاصيله."],
            [Wallet, "الوجبات والباقات والدفعات"],
          ].map(([Icon, text], i) => {
            const I = Icon as typeof Check;
            return (
              <div
                key={i}
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <I className="text-accent" size={22} />
                <span>{String(text)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-12 text-xs text-white/40">
          ويب عربي · توقيت الرياض · خصوصية من البداية
        </p>
      </aside>
    </main>
  );
}
