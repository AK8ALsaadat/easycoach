"use client";
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
        <label htmlFor="join-name">اسمك</label>
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
        <label htmlFor="join-email">إيميلك</label>
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
        <label htmlFor="join-phone">الجوال (اختياري)</label>
        <input id="join-phone" name="phone" className="field" maxLength={20} />
      </div>
      <button className="btn w-full" disabled={busy || result?.ok}>
        {busy ? "نرسل الطلب…" : "طلب الانضمام"}
      </button>
      <Notice result={result} />
      <p className="text-xs text-muted">
        بالمتابعة تطلب من المدرب مراجعة بياناتك وفق{" "}
        <Link className="underline" href="/privacy">
          إشعار الخصوصية
        </Link>
        . لا تُرسل رسائل واتساب تلقائية.
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
          {busy ? "نتحقق من هويتك…" : "قبول الدعوة وربط حسابي"}
        </button>
      ) : (
        <a
          href={`/login?next=${encodeURIComponent("/invite/" + token)}`}
          className="btn w-full"
        >
          سجّل الدخول بنفس إيميل الدعوة
        </a>
      )}
      <Notice result={result} />
      {result?.ok ? (
        <Link href="/me" className="btn-soft mt-5 w-full">
          افتح برنامجك
        </Link>
      ) : null}
    </div>
  );
}
