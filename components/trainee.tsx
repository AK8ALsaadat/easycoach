"use client";
import { useLocale } from "./locale-provider";
import { LanguageSwitch } from "./language-switch";
import Link from "next/link";
import { useState } from "react";
import { Download, LogOut, Shield, CalendarDays } from "lucide-react";
import { logoutAction, mutate } from "@/app/actions";
import { useRouter } from "next/navigation";
import { WeightPanel } from "./weight-panel";
import type { Snapshot } from "@/lib/model";
import { formatDate, riyadhToday } from "@/lib/dates";
import { latestSubscription } from "@/lib/subscription-period";
import { Brand } from "./brand";
import { DataForm } from "./forms";
import { ProgramView } from "./program-view";
import { ClientHub } from "./client-hub";
import { effectiveNutrition } from "@/lib/management";
import { TraineeCheckinStatus } from "./trainee-checkin-status";
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
  const publishedProgram = data.programs.find((p) => p.client_id === clientId && p.published_at);
  const clientWeights = (data.weights ?? []).filter((weight) => weight.client_id === clientId).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const subscriptions = data.subscriptions.filter(
    (s) => s.client_id === clientId,
  );
  const today = riyadhToday();
  const current =
    subscriptions.find((s) => s.start_date <= today && s.end_date >= today) ??
    subscriptions[0];
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
            <section className="card mb-6 p-5" aria-labelledby="linked-today-title">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="eyebrow">{tr("اليوم")}</p><h2 id="linked-today-title" className="mt-2 text-xl">{publishedProgram ? tr("خطتك لهذا اليوم") : tr("لا توجد خطة منشورة حاليًا")}</h2><p className="mt-2 text-sm text-muted">{clientWeights[0] ? `${tr("آخر وزن")}: ${clientWeights[0].weight} ${tr("كجم")} · ${formatDate(clientWeights[0].entry_date, locale)}` : tr("لا يوجد وزن مسجل بعد. سجّل تحديثًا سريعًا عندما يناسبك.")}</p><p className="mt-1 text-xs text-muted">{formatDate(today, locale)}</p></div>
                <TraineeCheckinStatus clientId={clientId} today={today} weights={clientWeights} records={data.management?.records ?? []} management={data.management} />
                  <div className="flex flex-wrap gap-2"><a className="btn" href="#linked-weight-panel">{tr("تسجيل الوزن")}</a><a className="btn-secondary" href="#client-management-hub">{tr("إرسال تحديث للمدرب")}</a></div>
              </div>
            </section>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(290px,1fr)]">
              <ProgramView
                focusToday
                nutrition={effectiveNutrition(
                  data.management?.records ?? [],
                  clientId,
                  publishedProgram?.published_at,
                )}
                program={publishedProgram}
              />
              <aside className="space-y-6">
                <div id="linked-weight-panel">
                <WeightPanel
                  entries={clientWeights}
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
                </div>
                <section className="card p-6">
                  <h2 className="flex items-center gap-2">
                    <CalendarDays size={18} className="text-teal" />
                    {tr("اشتراكك")}
                  </h2>
                  {current ? (
                    <>
                      <h3 className="mt-5 text-lg font-semibold">
                        {current.name}
                      </h3>
                      <p className="mt-3 text-sm text-muted">
                        {formatDate(current.start_date, locale)} —{" "}
                        {formatDate(latestSubscription(subscriptions, clientId)!.end_date, locale)}
                      </p>
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
                      <p className="mt-5 text-xs text-muted">{tr("للتجديد أو تعديل الباقة، أرسل طلبًا لمدربك. الدفع يتم بالاتفاق معه.")}</p>
                    </>
                  ) : (
                    <p className="mt-4 text-sm text-muted">
                      {tr("لم يضف مدربك باقة بعد.")}
                    </p>
                  )}
                  <button type="button" className="btn-secondary mt-4" onClick={() => {
                    window.dispatchEvent(new Event("easycoach:open-messages"));
                    document.getElementById("client-management-hub")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}>{tr(subscriptions.length ? "طلب تجديد الاشتراك من المدرب" : "التواصل مع المدرب")}</button>
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
              showRenewalRequest={subscriptions.length > 0}
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
