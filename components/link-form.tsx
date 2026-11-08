"use client";
import { useLocale } from "./locale-provider";
import Link from "next/link";
import { useState } from "react";
import { claimAction, requestJoinAction, type Result } from "@/app/actions";
import { Notice } from "./forms";
export function LinkForm({
  token,
  kind,
  loggedIn,
}: {
  token: string;
  kind: "join" | "invite";
  loggedIn: boolean;
}) {
  const { t: tr } = useLocale();

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  return kind === "join" ? (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          setResult(
            await requestJoinAction(token, new FormData(event.currentTarget)),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label htmlFor="join-name">{tr("اسمك")}</label>
        <input
          id="join-name"
          name="name"
          className="field"
          required
          minLength={2}
          maxLength={120}
        />
      </div>
      <div>
        <label htmlFor="join-email">{tr("إيميلك")}</label>
        <input
          id="join-email"
          name="email"
          type="email"
          className="field"
          required
          maxLength={254}
        />
      </div>
      <div>
        <label htmlFor="join-phone">{tr("الجوال (اختياري)")}</label>
        <input id="join-phone" name="phone" className="field" maxLength={20} />
      </div>
      <button className="btn w-full" disabled={busy || result?.ok}>
        {busy ? tr("نرسل الطلب…") : tr("طلب الانضمام")}
      </button>
      <Notice result={result} />
      <p className="text-xs text-muted">
        {tr("بالمتابعة تطلب من المدرب مراجعة بياناتك وفق")}{" "}
        <Link className="underline" href="/privacy">
          {tr("إشعار الخصوصية")}
        </Link>
        {tr(". لا تُرسل رسائل واتساب تلقائية.")}
      </p>
    </form>
  ) : (
    <div>
      {loggedIn ? (
        <button
          disabled={busy || result?.ok}
          className="btn w-full"
          onClick={async () => {
            setBusy(true);
            try {
              setResult(await claimAction(token));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? tr("نتحقق من هويتك…") : tr("قبول الدعوة وربط حسابي")}
        </button>
      ) : (
        <a
          href={`/login?next=${encodeURIComponent("/invite/" + token)}`}
          className="btn w-full"
        >
          {tr("سجّل الدخول بنفس إيميل الدعوة")}
        </a>
      )}
      <Notice result={result} />
      {result?.ok ? (
        <Link href="/me" className="btn-soft mt-5 w-full">
          {tr("افتح برنامجك")}
        </Link>
      ) : null}
    </div>
  );
}
