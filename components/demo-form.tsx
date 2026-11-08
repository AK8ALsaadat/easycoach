"use client";
import { useState } from "react";
import { demoLogin } from "@/app/demo-actions";
import type { Result } from "@/app/actions";
import { useLocale } from "./locale-provider";
import { Notice } from "./forms";
export function DemoForm() {
  const { t } = useLocale(),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Result | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          setResult(await demoLogin(new FormData(event.currentTarget)));
        } catch {
          setResult({ ok: false, message: "تعذر الاتصال. أعد المحاولة." });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="demo-username">
        {t("اسم المستخدم")}
        <input
          id="demo-username"
          name="username"
          className="field"
          autoComplete="username"
          defaultValue="test"
          required
        />
      </label>
      <label htmlFor="demo-password">
        {t("كلمة المرور")}
        <input
          id="demo-password"
          name="password"
          type="password"
          className="field"
          autoComplete="current-password"
          defaultValue="test"
          required
        />
      </label>
      <button className="btn w-full" disabled={busy} type="submit">
        {t(busy ? "نتحقق من بياناتك…" : "دخول الحساب التجريبي")}
      </button>
      <Notice result={result} />
    </form>
  );
}
