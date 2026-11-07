"use client";
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
          setBusy(false);
          if (r.ok) router.refresh();
        }}
      >
        <h2 className="flex items-center gap-2">
          <Target size={20} />
          هدف المرحلة
        </h2>
        <label>
          الهدف
          <select name="goal" className="field" defaultValue={goal?.goal ?? ""}>
            <option value="">حدد الهدف</option>
            <option>بناء عضل</option>
            <option>خفض دهون</option>
            <option>رفع القوة</option>
            <option>تحسين اللياقة</option>
            <option>المحافظة</option>
          </select>
        </label>
        <label>
          الوزن المستهدف (اختياري)
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
          تركيز البرنامج
          <input
            className="field"
            name="focus"
            maxLength={200}
            placeholder="مثال: تقوية الجزء السفلي · 4 أيام"
            defaultValue={goal?.focus ?? ""}
          />
        </label>
        <label>
          ملاحظاتك الخاصة
          <textarea
            className="field"
            name="notes"
            maxLength={2000}
            defaultValue={goal?.notes ?? ""}
            placeholder="معدات النادي، وقت الحصة المتاح، تفضيلات الوجبات…"
          />
        </label>
        <button className="btn" disabled={busy}>
          حفظ الهدف
        </button>
        <p role="status" className="text-xs text-muted">
          {error}
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
          <h3 className="font-bold">رابط العميل</h3>
          <p className="text-xs text-muted">
            الجدول، الوجبات، والوزن · نفس الرابط لكل تحديث منشور
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
            setResult(await createPortal(clientId));
            setBusy(false);
            router.refresh();
          }}
        >
          {link && !link.revoked_at ? (
            <RefreshCw size={15} />
          ) : (
            <Link2 size={15} />
          )}{" "}
          {busy
            ? "نجهز الرابط…"
            : link && !link.revoked_at
              ? "تغيير الرابط والرمز"
              : "تفعيل رابط العميل"}
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
            إيقاف الرابط
          </button>
        ) : null}
      </div>
      {result?.url ? (
        <div className="portal-share">
          <input
            aria-label="رابط العميل الخاص"
            readOnly
            value={result.url}
            className="field"
            dir="ltr"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs">رمز دخول العميل</span>
            <strong className="font-mono text-2xl tracking-[.2em]">
              {result.pin}
            </strong>
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
              نسخ الرابط
            </button>
          </div>
          <p className="text-xs text-muted">
            شارك الرمز مع العميل بشكل منفصل. احفظ الرابط والرمز الآن؛ لن نعرضهما
            مرة ثانية. صالح 180 يومًا، ويمكن إيقافه بأي وقت.
          </p>
        </div>
      ) : null}
      {link?.last_opened_at ? (
        <p className="text-xs text-muted">
          آخر نشاط:{" "}
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
