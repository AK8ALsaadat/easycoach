"use client";
import { useEffect, useState } from "react";
import { paylinkStatus, removePaylinkAccount, savePaylinkAccount, type PaylinkStatus } from "@/app/paylink-actions";
import { useLocale } from "./locale-provider";

export function PaylinkSettings() {
  const { t } = useLocale();
  const [status, setStatus] = useState<PaylinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [apiId, setApiId] = useState("");
  const [secretKey, setSecretKey] = useState("");

  async function load() {
    try {
      setStatus(await paylinkStatus());
    } catch {
      setStatus(null);
    }
  }
  useEffect(() => {
    let live = true;
    paylinkStatus()
      .then((value) => {
        if (live) setStatus(value);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!status || !status.available) return null;

  return (
    <section className="card mb-5 p-5" aria-labelledby="paylink-heading" data-testid="paylink-settings">
      <h2 id="paylink-heading">{t("الدفع الإلكتروني (Paylink)")}</h2>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t("اربط حساب Paylink حقك، ويظهر لمتدربينك زر «ادفع الآن» على اشتراكهم. المبلغ يروح لحسابك في Paylink مباشرة، وتنضاف الدفعة لاشتراك المتدرب تلقائيًا بعد ما نتأكد منها.")}
      </p>
      {status.testMode ? <p className="mt-3 rounded-xl bg-canvas p-3 text-xs">{t("المنصة الآن على بيئة التجربة في Paylink: استخدم مفاتيح التجربة، وما فيه فلوس حقيقية.")}</p> : null}

      {status.connected ? (
        <div className="mt-4 space-y-3 text-sm">
          <p role="status">
            <strong>{t("الحساب مربوط")}</strong>
            {status.source === "env" ? <span className="block text-xs text-muted">{t("مربوط من إعدادات الخادم.")}</span> : null}
          </p>
          <div className="rounded-xl bg-canvas p-3 text-xs leading-6">
            <p className="font-semibold">{t("خطوة أخيرة: أضف الـ Webhook من إعدادات حسابك في لوحة Paylink:")}</p>
            <p className="mt-1">
              {t("رابط الـ Webhook")}: <bdi dir="ltr" className="select-all break-all">{status.webhookUrl}</bdi>
            </p>
            {status.webhookSecret ? (
              <p className="mt-1">
                {t("أضف Header باسم Authorization وقيمته")}: <bdi dir="ltr" className="select-all break-all">Bearer {status.webhookSecret}</bdi>
              </p>
            ) : status.source === "env" ? (
              <p className="mt-1">{t("قيمة الـ Header هي Bearer متبوعة بقيمة PAYLINK_WEBHOOK_SECRET.")}</p>
            ) : null}
          </div>
          {status.source === "account" ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setNotice(null);
                try {
                  setNotice(await removePaylinkAccount());
                  await load();
                } catch {
                  setNotice({ ok: false, message: "تعذر الاتصال. أعد المحاولة." });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("فصل حساب Paylink")}
            </button>
          ) : null}
        </div>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setNotice(null);
            try {
              const result = await savePaylinkAccount({ apiId, secretKey });
              setNotice(result);
              if (result.ok) {
                setApiId("");
                setSecretKey("");
                await load();
              }
            } catch {
              setNotice({ ok: false, message: "تعذر الاتصال. أعد المحاولة." });
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <label className="block" htmlFor="paylink-api-id">
              API ID
              <input id="paylink-api-id" className="field" dir="ltr" autoComplete="off" value={apiId} onChange={(e) => setApiId(e.target.value)} required maxLength={200} />
            </label>
            <label className="block" htmlFor="paylink-secret">
              Secret Key
              <input id="paylink-secret" className="field" dir="ltr" type="password" autoComplete="off" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} required maxLength={400} />
            </label>
            <p className="text-xs text-muted">{t("تلقاها في إعدادات حسابك بلوحة Paylink. نحفظها مشفّرة، وما نعرضها مرة ثانية.")}</p>
            <button className="btn">{busy ? t("جاري التحقق من المفاتيح…") : t("ربط الحساب")}</button>
          </fieldset>
        </form>
      )}
      {notice ? (
        <p role={notice.ok ? "status" : "alert"} className="mt-3 text-sm leading-7">
          {t(notice.message)}
        </p>
      ) : null}
    </section>
  );
}
