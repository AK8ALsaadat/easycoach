"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAccount, retryPhotoCleanup } from "@/app/account-actions";
import { useLocale } from "./locale-provider";
import { Notice } from "./forms";
import type { Result } from "@/app/actions";
export function AccountSettings({ name }: { name: string }) {
  const { t } = useLocale(),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Result | null>(null);
  return (
    <section className="card p-5 mb-5">
      <h2>{t("إعدادات الحساب")}</h2>
      <form
        className="flex flex-wrap items-end gap-3 mt-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            setResult(
              await saveAccount(new FormData(event.currentTarget).get("name")),
            );
            router.refresh();
          } catch {
            setResult({ ok: false, message: "تعذر الاتصال. أعد المحاولة." });
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="flex-1">
          {t("اسم الحساب")}
          <input
            name="name"
            className="field"
            required
            minLength={2}
            maxLength={120}
            defaultValue={name}
          />
        </label>
        <button className="btn" disabled={busy}>
          {t("حفظ")}
        </button>
      </form>
      <button
        className="btn-secondary mt-4"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setResult(await retryPhotoCleanup());
          } catch {
            setResult({ ok: false, message: "تعذر الاتصال. أعد المحاولة." });
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("إعادة محاولة حذف ملفات الصور المعلّقة")}
      </button>
      <Notice result={result} />
    </section>
  );
}
