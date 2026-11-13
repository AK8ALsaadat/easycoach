import Link from "next/link";
import { CheckCircle2, Clock3, SearchX, XCircle } from "lucide-react";
import { Brand } from "./brand";
import type { VerifyResult } from "@/lib/paylink/flow";

type Copy = { title: string; body: string; tone: "ok" | "wait" | "fail" };

const copy: Record<VerifyResult["state"] | "cancelled_by_user", Copy> = {
  paid: { tone: "ok", title: "تم الدفع بنجاح", body: "سجّلنا دفعتك وتحدّث اشتراكك. شكرًا لك." },
  review: { tone: "wait", title: "استلمنا دفعتك", body: "وصلت الدفعة، وتحتاج مراجعة سريعة من مدربك قبل ما تنضاف لاشتراكك. لا تدفع مرة ثانية." },
  pending: { tone: "wait", title: "الدفع قيد المعالجة", body: "ما وصلنا تأكيد الدفع من Paylink بعد. حدّث الصفحة بعد دقيقة، ولا تدفع مرة ثانية قبل ما تتأكد." },
  failed: { tone: "fail", title: "ما تم الدفع", body: "رفضت Paylink العملية، وما انخصم منك شي. تقدر تحاول مرة ثانية ببطاقة أخرى." },
  canceled: { tone: "fail", title: "ما تم الدفع", body: "انتهت صلاحية الفاتورة أو أُلغيت. ارجع لاشتراكك وأنشئ رابط دفع جديد." },
  unknown: { tone: "fail", title: "ما لقينا عملية الدفع", body: "الرابط ناقص أو غير صحيح. ارجع لاشتراكك وتأكد من حالته." },
  error: { tone: "wait", title: "تعذّر التحقق من الدفع الآن", body: "حدّث الصفحة بعد قليل. إذا انخصم المبلغ فبيتسجل في اشتراكك تلقائيًا." },
  cancelled_by_user: { tone: "fail", title: "ألغيت عملية الدفع", body: "ما انخصم منك شي. تقدر ترجع وتدفع متى ما حبيت." },
};

const icons = { ok: CheckCircle2, wait: Clock3, fail: XCircle };

export function PaylinkResult({
  result,
  tr,
  cancelled = false,
  retryHref,
}: {
  result: VerifyResult;
  tr: (text: string, ...values: string[]) => string;
  cancelled?: boolean;
  retryHref?: string;
}) {
  const key = cancelled && !["paid", "review"].includes(result.state) ? "cancelled_by_user" : result.state;
  const text = copy[key];
  const Icon = key === "unknown" ? SearchX : icons[text.tone];
  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-5">
      <Brand />
      <section className="card mt-9 p-6 sm:p-8" data-testid={`paylink-result-${key}`} aria-live="polite">
        <Icon size={34} className={text.tone === "ok" ? "text-teal" : text.tone === "fail" ? "text-danger" : "text-muted"} aria-hidden="true" />
        <h1 className="mt-4 text-2xl">{tr(text.title)}</h1>
        <p className="mt-3 text-sm leading-7 text-muted">{tr(text.body)}</p>
        {typeof result.amount === "number" && ["paid", "review"].includes(result.state) ? (
          <p className="mt-4 text-sm">
            {tr("المبلغ")}: <bdi dir="ltr">{result.amount.toFixed(2)}</bdi> {tr("ر.س")}
          </p>
        ) : null}
        {result.errors.length && !["paid", "review"].includes(result.state) ? (
          <ul className="mt-5 space-y-2 rounded-xl bg-canvas p-4 text-sm" data-testid="paylink-errors">
            {result.errors.map((error, i) => (
              <li key={i}>
                <strong>{error.errorTitle || tr("سبب الرفض")}</strong>
                {error.errorMessage ? <span className="block text-muted">{error.errorMessage}</span> : null}
                {error.errorCode ? <span className="block text-xs text-muted">{tr("رمز")}: <bdi dir="ltr">{error.errorCode}</bdi></span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link className="btn" href="/me">
            {tr(["paid", "review"].includes(result.state) ? "الرجوع لاشتراكي" : "الرجوع للاشتراك والمحاولة مجددًا")}
          </Link>
          {(result.state === "pending" || result.state === "error") && retryHref ? (
            <a className="btn-secondary" href={retryHref}>
              {tr("تحديث الحالة")}
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}
