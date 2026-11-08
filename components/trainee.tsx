"use client";
import { useLocale } from "./locale-provider";
import { LanguageSwitch } from "./language-switch";
import Link from "next/link";
import { useState } from "react";
import { Download, LogOut, Shield, Wallet } from "lucide-react";
import { logoutAction, mutate } from "@/app/actions";
import { useRouter } from "next/navigation";
import { WeightPanel } from "./weight-panel";
import type { Snapshot } from "@/lib/model";
import { formatDate, money, riyadhToday } from "@/lib/dates";
import { Brand } from "./brand";
import { DataForm } from "./forms";
import { ProgramView } from "./program-view";
import { ClientHub } from "./client-hub";
import { effectiveNutrition } from "@/lib/management";
export function Trainee({
  data,
  selectedId,
}: {
  data: Snapshot;
  selectedId?: string;
}) {
  const { t: tr, language: locale } = useLocale();

  const router = useRouter();
  const clients = data.clients.filter(
    (c) => c.trainee_user_id === data.profile?.id && !c.archived,
  );
  const [clientId, setClientId] = useState(
    selectedId && clients.some((c) => c.id === selectedId)
      ? selectedId
      : (clients[0]?.id ?? ""),
  );
  const client = clients.find((c) => c.id === clientId);
  const subscriptions = data.subscriptions.filter(
    (s) => s.client_id === clientId,
  );
  const today = riyadhToday();
  const current =
    subscriptions.find((s) => s.start_date <= today && s.end_date >= today) ??
    subscriptions[0];
  const paid = current
    ? data.payments
        .filter((p) => p.subscription_id === current.id)
        .reduce((n, p) => n + Number(p.amount), 0)
    : 0;
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white px-5 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Brand />
          <LanguageSwitch />
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted">
              {tr("أهلًا،")} {data.profile!.name}
            </span>
            <form action={logoutAction}>
              <button className="btn-secondary">
                <LogOut size={15} />
                {tr("خروج")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-9">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs text-teal">{tr("مساحتك مع مدربك")}</p>
            <h1>{tr("برنامجك، بوضوح.")}</h1>
            <p className="mt-2 text-sm text-muted">
              {tr("جدولك، وجباتك، وتقدمك مع مدربك.")}
            </p>
          </div>
          <a download href="/api/export" className="btn-secondary">
            <Download size={15} />
            {tr("تصدير بياناتي")}
          </a>
        </div>
        {!client ? (
          <div className="card empty">
            <Shield size={30} className="text-teal" />
            <h2>{tr("حسابك جاهز، وينتظر ربطه بمدربك")}</h2>
            <p>
              {tr(
                "افتح دعوة مدربك وأنت داخل بنفس الإيميل الموثّق. طلب الانضمام وحده لا يمنح الوصول.",
              )}
            </p>
            {data.profile?.role === "coach" ? (
              <Link href="/coach" className="btn">
                {tr("لوحة المدرب")}
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            {clients.length > 1 ? (
              <div className="mb-5">
                <label htmlFor="portal-client">
                  {tr("اختر اشتراكك مع المدرب")}
                </label>
                <select
                  id="portal-client"
                  className="field max-w-md"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  {clients.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name} · {c.coach_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(290px,1fr)]">
              <ProgramView
                nutrition={effectiveNutrition(
                  data.management?.records ?? [],
                  clientId,
                  data.programs.find(
                    (p) => p.client_id === clientId && p.published_at,
                  )?.published_at,
                )}
                program={data.programs.find(
                  (p) => p.client_id === clientId && p.published_at,
                )}
              />
              <aside className="space-y-6">
                <WeightPanel
                  entries={(data.weights ?? []).filter(
                    (w) => w.client_id === clientId,
                  )}
                  target={
                    data.client_goals?.find((g) => g.client_id === clientId)
                      ?.target_weight
                  }
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
                <section className="card p-6">
                  <h2 className="flex items-center gap-2">
                    <Wallet size={18} className="text-teal" />
                    {tr("اشتراكك")}
                  </h2>
                  {current ? (
                    <>
                      <h3 className="mt-5 text-lg font-semibold">
                        {current.name}
                      </h3>
                      <p className="mt-3 text-sm text-muted">
                        {formatDate(current.start_date, locale)} —{" "}
                        {formatDate(current.end_date, locale)}
                      </p>
                      <div className="mt-5 space-y-3 border-t pt-4 text-sm">
                        <p className="flex justify-between">
                          <span className="text-muted">
                            {tr("قيمة الباقة")}
                          </span>
                          <span>{money(current.price, locale)}</span>
                        </p>
                        <p className="flex justify-between">
                          <span className="text-muted">{tr("المدفوع")}</span>
                          <span>{money(paid, locale)}</span>
                        </p>
                        <p className="flex justify-between font-semibold">
                          <span>{tr("المتبقي")}</span>
                          <span>
                            {money(Number(current.price) - paid, locale)}
                          </span>
                        </p>
                      </div>
                      {data.freezes
                        .filter((f) => f.subscription_id === current.id)
                        .map((f) => (
                          <p
                            className="mt-3 rounded-xl bg-canvas p-3 text-xs text-muted"
                            key={f.id}
                          >
                            {tr("تجميد")} {formatDate(f.start_date, locale)} —{" "}
                            {formatDate(f.end_date, locale)}
                            {tr(". طُبّق تمديد")} {f.days} {tr("يومًا.")}
                          </p>
                        ))}
                      <p className="mt-5 text-xs text-muted">
                        {tr(
                          "لأي تعديل أو تجديد، تواصل مع مدربك. سجل الدفعات ليس فاتورة ضريبية.",
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="mt-4 text-sm text-muted">
                      {tr("لم يضف مدربك باقة بعد.")}
                    </p>
                  )}
                </section>
                <details className="card p-6">
                  <summary>{tr("طلب تصحيح أو حذف بياناتي")}</summary>
                  <p className="my-4 text-xs leading-7 text-muted">
                    {tr(
                      "يصل الطلب لمدربك للمراجعة والتنفيذ. لا تكتب بيانات طبية في الطلب.",
                    )}
                  </p>
                  <DataForm
                    key={clientId}
                    command="privacy_request"
                    base={{ client_id: clientId }}
                    fields={[
                      {
                        name: "kind",
                        label: "نوع الطلب",
                        type: "select",
                        options: [
                          { value: "correction", label: "تصحيح بيانات" },
                          {
                            value: "deletion",
                            label: "حذف بياناتي وإلغاء الوصول",
                          },
                        ],
                      },
                      {
                        name: "details",
                        label: "تفاصيل الطلب",
                        type: "textarea",
                        required: true,
                      },
                    ]}
                    label={tr("إرسال الطلب للمدرب")}
                  />
                  {data.privacy_requests
                    .filter((r) => r.client_id === clientId)
                    .map((r) => (
                      <p
                        className="mt-4 border-t pt-3 text-xs text-muted"
                        key={r.id}
                      >
                        {r.kind === "deletion" ? tr("حذف") : tr("تصحيح")} ·{" "}
                        {r.status === "fulfilled"
                          ? tr("تمت المعالجة")
                          : tr("ينتظر المراجعة")}
                        {r.resolution ? " · " + r.resolution : ""}
                      </p>
                    ))}
                </details>
              </aside>
            </div>
          </>
        )}
        {client && (
          <div className="mt-7">
            <ClientHub
              key={clientId}
              clientId={clientId}
              management={data.management}
              weights={data.weights ?? []}
              program={data.programs.find(
                (program) =>
                  program.client_id === clientId && program.published_at,
              )}
              targetWeight={
                data.client_goals?.find((goal) => goal.client_id === clientId)
                  ?.target_weight
              }
            />
          </div>
        )}
      </main>
      <footer className="mx-auto max-w-6xl border-t px-5 py-6 text-xs text-muted">
        <Link href="/privacy" className="underline">
          {tr("الخصوصية")}
        </Link>{" "}
        {tr("· جميع التواريخ بتوقيت الرياض")}
      </footer>
    </div>
  );
}
