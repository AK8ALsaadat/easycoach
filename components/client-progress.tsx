"use client";
import { useLocale } from "./locale-provider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Link2, Copy, RefreshCw } from "lucide-react";
import type { Snapshot } from "@/lib/model";
import { mutate } from "@/app/actions";
import { createPortal } from "@/app/studio-actions";
import { WeightPanel } from "./weight-panel";
export function ClientProgress({
  data,
  clientId,
}: {
  data: Snapshot;
  clientId: string;
}) {
  const { t: tr } = useLocale();

  const router = useRouter();
  const goal = data.client_goals?.find((g) => g.client_id === clientId);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
      <WeightPanel
        entries={(data.weights ?? []).filter((w) => w.client_id === clientId)}
        target={goal?.target_weight}
        onSave={async (day, weight) => {
          const r = await mutate("weight_save", {
            client_id: clientId,
            entry_date: day,
            weight,
          });
          if (r.ok) router.refresh();
          else return r.message;
        }}
        onDelete={async (day) => {
          const r = await mutate("weight_delete", {
            client_id: clientId,
            entry_date: day,
          });
          if (r.ok) router.refresh();
          else return r.message;
        }}
      />
      <form
        className="card space-y-4 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const r = await mutate("goal_save", {
              client_id: clientId,
              goal: f.get("goal"),
              target_weight: f.get("target_weight")
                ? Number(f.get("target_weight"))
                : null,
              focus: f.get("focus"),
              notes: f.get("notes"),
            });
            setError(r.message);
            if (r.ok) router.refresh();
          } catch {
            setError("تعذر الاتصال. لم نتأكد من الحفظ؛ احتفظ بالبيانات وأعد المحاولة.");
          } finally { setBusy(false); }
        }}
      >
        <h2 className="flex items-center gap-2">
          <Target size={20} />
          {tr("هدف المرحلة")}
        </h2>
        <label>
          {tr("الهدف")}
          <select name="goal" className="field" defaultValue={goal?.goal ?? ""}>
            <option value="">{tr("حدد الهدف")}</option>
            <option value="بناء عضل">{tr("بناء عضل")}</option>
            <option value="خفض دهون">{tr("خفض دهون")}</option>
            <option value="رفع القوة">{tr("رفع القوة")}</option>
            <option value="تحسين اللياقة">{tr("تحسين اللياقة")}</option>
            <option value="المحافظة">{tr("المحافظة")}</option>
          </select>
        </label>
        <label>
          {tr("الوزن المستهدف (اختياري)")}
          <input
            className="field"
            name="target_weight"
            type="number"
            min={20}
            max={400}
            step="0.1"
            defaultValue={goal?.target_weight ?? ""}
          />
        </label>
        <label>
          {tr("تركيز البرنامج")}
          <input
            className="field"
            name="focus"
            maxLength={200}
            placeholder={tr("مثال: تقوية الجزء السفلي · 4 أيام")}
            defaultValue={goal?.focus ?? ""}
          />
        </label>
        <label>
          {tr("ملاحظاتك الخاصة")}
          <textarea
            className="field"
            name="notes"
            maxLength={2000}
            defaultValue={goal?.notes ?? ""}
            placeholder={tr("معدات النادي، وقت الحصة المتاح، تفضيلات الوجبات…")}
          />
        </label>
        <button className="btn" disabled={busy}>
          {tr("حفظ الهدف")}
        </button>
        <p role="status" className="text-xs text-muted">
          {tr(error)}
        </p>
      </form>
    </div>
  );
}
export function PortalControl({
  clientId,
  link,
}: {
  clientId: string;
  link?: Snapshot["portal_links"][number];
}) {
  const { t: tr } = useLocale();

  const router = useRouter();
  const [result, setResult] = useState<{
      url?: string;
      pin?: string;
      error?: string;
    } | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <section className="portal-control">
      <div className="flex items-center gap-3">
        <div className="portal-icon">
          <Link2 size={22} />
        </div>
        <div>
          <h3 className="font-bold">{tr("دخول المتدرب دون حساب")}</h3>
          <p className="text-xs text-muted">
            {tr("الجدول، الوجبات، والوزن · نفس الرابط لكل تحديث منشور")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-secondary"
          disabled={busy}
          onClick={async () => {
            if (
              link &&
              !link.revoked_at &&
              !window.confirm("إنشاء رابط جديد يلغي الرابط السابق. تتابع؟")
            )
              return;
            setBusy(true);
            try {
              const result = await createPortal(clientId);
              setResult(result);
              if (result.ok) router.refresh();
            } catch {
              setResult({ error: "تعذر الاتصال. لم نتأكد من إنشاء الرابط؛ حدّث الصفحة قبل إعادة المحاولة." });
            } finally { setBusy(false); }
          }}
        >
          {link && !link.revoked_at ? (
            <RefreshCw size={15} />
          ) : (
            <Link2 size={15} />
          )}{" "}
          {busy
            ? tr("نجهز الرابط…")
            : link && !link.revoked_at
              ? tr("تجديد رابط الدخول")
              : tr("إنشاء رابط دخول للمتدرب")}
        </button>
        {link && !link.revoked_at ? (
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("إيقاف وصول العميل من الرابط الحالي؟"))
                return;
              const r = await mutate("portal_revoke", { client_id: clientId });
              if (!r.ok) setResult({ error: r.message });
              else {
                setResult(null);
                router.refresh();
              }
            }}
          >
            {tr("إيقاف الرابط")}
          </button>
        ) : null}
      </div>
      {result?.url ? (
        <div className="portal-share">
          <input
            aria-label={tr("رابط العميل الخاص")}
            readOnly
            value={result.url}
            className="field"
            dir="ltr"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex flex-wrap items-center gap-4">
            <button
              className="btn-soft"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result.url!);
                } catch {
                  window.prompt("انسخ الرابط", result.url);
                }
              }}
            >
              <Copy size={14} />
              {tr("نسخ الرابط")}
            </button>
          </div>
          <p className="text-xs text-muted">
            {tr(
              "أي شخص يملك هذا الرابط يستطيع دخول بوابة المتدرب دون حساب. شاركه مع المتدرب فقط. احفظه الآن؛ لن نعرضه مرة ثانية. صالح 180 يومًا ويمكن إيقافه أو تجديده. الروابط السابقة تبقى صالحة حتى تجديدها.",
            )}
          </p>
        </div>
      ) : null}
      {link?.last_opened_at ? (
        <p className="text-xs text-muted">
          {tr("آخر نشاط:")}{" "}
          {new Intl.DateTimeFormat("ar-SA", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Riyadh",
          }).format(new Date(link.last_opened_at))}
        </p>
      ) : null}
      {result?.error ? (
        <p role="alert" className="text-sm text-red-700">
          {result.error}
        </p>
      ) : null}
    </section>
  );
}
