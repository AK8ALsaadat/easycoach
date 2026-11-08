"use client";
import { useLocale } from "./locale-provider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { manage } from "@/app/management-actions";
import { defaultPreferences } from "@/lib/management";
import type { Snapshot } from "@/lib/model";
import type { Result } from "@/app/actions";
import { Notice } from "./forms";
export function NotificationSettings({ data }: { data: Snapshot }) {
  const { t: tr } = useLocale();

  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false);
  const settings = { ...defaultPreferences, ...data.management?.preferences };
  return (
    <form
      className="card p-5 mb-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        const form = new FormData(event.currentTarget);
        try {
          const response = await manage("preferences_save", {
            language: settings.language,
            checkin_days: Number(form.get("checkin_days")),
            weight_days: Number(form.get("weight_days")),
            low_adherence: Number(form.get("low_adherence")),
            reminders: form.get("reminders") === "on",
          });
          setResult(response);
          if (response.ok) router.refresh();
        } catch {
          setResult({
            ok: false,
            message:
              "تعذر الاتصال. لم نتأكد من الحفظ؛ أعد المحاولة بنفس البيانات.",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{tr("إعدادات المتابعة والتنبيهات")}</h2>
      <p className="text-sm text-muted mt-2">
        {tr(
          "تذكيرات داخل المنصة محسوبة عند فتحها. لا إرسال تلقائي إلى البريد أو واتساب.",
        )}
      </p>
      <div className="grid gap-3 mt-4 sm:grid-cols-3">
        <label>
          {tr("المراجعة كل (يوم)")}
          <input
            name="checkin_days"
            className="field"
            type="number"
            min={1}
            max={30}
            defaultValue={settings.checkin_days}
            required
          />
        </label>
        <label>
          {tr("تحديث الوزن كل (يوم)")}
          <input
            name="weight_days"
            className="field"
            type="number"
            min={1}
            max={90}
            defaultValue={settings.weight_days}
            required
          />
        </label>
        <label>
          {tr("تنبيه الالتزام دون (%)")}
          <input
            name="low_adherence"
            className="field"
            type="number"
            min={0}
            max={100}
            defaultValue={settings.low_adherence}
            required
          />
        </label>
      </div>
      <label className="flex gap-2 mt-3">
        <input
          type="checkbox"
          name="reminders"
          defaultChecked={settings.reminders}
        />
        {tr("تفعيل تذكيرات المتابعة")}
      </label>
      <button className="btn mt-4" disabled={busy}>
        {tr("حفظ تفضيلات التنبيهات")}
      </button>
      <Notice result={result} />
    </form>
  );
}
