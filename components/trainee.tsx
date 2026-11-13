"use client";
import { useLocale } from "./locale-provider";
import { LanguageSwitch } from "./language-switch";
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { CalendarDays, CloudOff, Download, Dumbbell, LogOut, Menu, MessageCircle, PauseCircle, Shield, TrendingUp, Utensils, X } from "lucide-react";
import { logoutAction, mutate } from "@/app/actions";
import { useRouter } from "next/navigation";
import { WeightPanel } from "./weight-panel";
import type { Snapshot } from "@/lib/model";
import { formatDate, riyadhToday } from "@/lib/dates";
import { latestSubscription } from "@/lib/subscription-period";
import { PaylinkPay } from "./paylink-pay";
import { Brand } from "./brand";
import { DataForm } from "./forms";
import { ProgramView } from "./program-view";
import { ClientHub } from "./client-hub";
import { effectiveNutrition } from "@/lib/management";
import { TraineeCheckinStatus } from "./trainee-checkin-status";
import { CoachIdentity } from "./coach-identity";
import { PhotoConsentDialog, useConsentPrompt } from "./photo-consent";
import { InstallPrompt } from "./install-prompt";
import { clearPrivateCaches } from "./pwa-manager";
import { clearQueue, flushQueue, queueWeight, QUEUE_EVENT, readQueue } from "@/lib/offline-queue";
import { countLabel, nouns } from "@/lib/plural";

const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
const subscribeQueue = (notify: () => void) => {
  window.addEventListener(QUEUE_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(QUEUE_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
};
/** On logout a shared phone keeps neither the cached plan nor unsent weights. */
const forgetDevice = () => {
  clearPrivateCaches();
  clearQueue();
};

function TraineeHeader({ name }: { name: string }) {
  const { t: tr } = useLocale();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <header className="trainee-header">
      <div className="trainee-header-bar mx-auto max-w-6xl">
        <Brand />
        <div className="trainee-header-inline">
          <LanguageSwitch />
          <span className="text-sm text-muted">{tr("أهلًا،")} {name}</span>
          <form action={logoutAction} onSubmit={forgetDevice}>
            <button className="btn-secondary">
              <LogOut size={15} />
              {tr("خروج")}
            </button>
          </form>
        </div>
        <button type="button" className="trainee-menu-button btn-secondary" aria-expanded={open} aria-controls="trainee-menu" aria-label={tr(open ? "إغلاق القائمة" : "فتح القائمة")} onClick={() => setOpen(!open)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div id="trainee-menu" className="trainee-menu">
          <p className="text-sm text-muted">{tr("أهلًا،")} {name}</p>
          <LanguageSwitch />
          <a download href="/api/export" className="btn-secondary" onClick={() => setOpen(false)}>
            <Download size={15} />
            {tr("تصدير بياناتي")}
          </a>
          <form action={logoutAction} onSubmit={forgetDevice}>
            <button className="btn-secondary w-full">
              <LogOut size={15} />
              {tr("خروج")}
            </button>
          </form>
        </div>
      )}
    </header>
  );
}

const sections = ["today", "training", "nutrition", "client-management-hub"] as const;
function BottomNav() {
  const { t: tr } = useLocale();
  const [active, setActive] = useState<string>("today");
  const [hubTab, setHubTab] = useState<"progress" | "messages">("progress");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-35% 0px -55% 0px" },
    );
    for (const id of sections) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);
  const go = (id: string, tab?: "progress" | "messages") => {
    if (tab) {
      setHubTab(tab);
      window.dispatchEvent(new CustomEvent("easycoach:open-hub-tab", { detail: tab }));
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const items = [
    { id: "today", label: "اليوم", icon: CalendarDays },
    { id: "training", label: "التمارين", icon: Dumbbell },
    { id: "nutrition", label: "التغذية", icon: Utensils },
    { id: "client-management-hub", tab: "progress" as const, label: "التقدم", icon: TrendingUp },
    { id: "client-management-hub", tab: "messages" as const, label: "الرسائل", icon: MessageCircle },
  ];
  return (
    <nav className="trainee-bottom-nav" aria-label={tr("أقسام بوابتك")}>
      {items.map((item) => {
        const current = active === item.id && (!item.tab || item.tab === hubTab);
        return (
          <button key={item.label} type="button" aria-current={current ? "true" : undefined} className={current ? "active" : ""} onClick={() => go(item.id, item.tab)}>
            <item.icon size={21} aria-hidden="true" />
            <span>{tr(item.label)}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Trainee({
  data,
  selectedId,
  paylinkCoaches = [],
}: {
  data: Snapshot;
  selectedId?: string;
  paylinkCoaches?: string[];
}) {
  const { t: tr, language: locale } = useLocale();

  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [router]);
  const clients = data.clients.filter(
    (c) => c.trainee_user_id === data.profile?.id && !c.archived,
  );
  const [clientId, setClientId] = useState(
    selectedId && clients.some((c) => c.id === selectedId)
      ? selectedId
      : (clients[0]?.id ?? ""),
  );
  const client = clients.find((c) => c.id === clientId);
  const coachName = data.coach_branding?.find((b) => b.coach_id === client?.coach_id)?.name ?? "";
  const publishedProgram = data.programs.find((p) => p.client_id === clientId && p.published_at);
  const clientWeights = (data.weights ?? []).filter((weight) => weight.client_id === clientId).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const subscriptions = data.subscriptions.filter(
    (s) => s.client_id === clientId,
  );
  const today = riyadhToday();
  const current =
    subscriptions.find((s) => s.start_date <= today && s.end_date >= today) ??
    subscriptions[0];
  const nutrition = effectiveNutrition(data.management?.records ?? [], clientId, publishedProgram?.published_at);
  const consentState = data.management?.photo_consents?.find((state) => state.client_id === clientId);
  // Prompt only when the consent state is known (the snapshot loaded it).
  const consentPrompt = useConsentPrompt(consentState, client && data.management?.photo_consents ? clientId : "");
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const pending = useSyncExternalStore(subscribeQueue, () => readQueue().filter((item) => item.client_id === clientId).length, () => 0);
  const [syncMessage, setSyncMessage] = useState("");
  const sync = useCallback(async () => {
    if (!navigator.onLine || !readQueue().length) return;
    const result = await flushQueue((item) => mutate("weight_save", { client_id: item.client_id, entry_date: item.entry_date, weight: item.weight }));
    if (result.sent) router.refresh();
    setSyncMessage(result.errors[0] ?? (result.sent ? tr("تمت مزامنة {0}", countLabel(locale, result.sent, nouns.weight)) : ""));
  }, [router, tr, locale]);
  useEffect(() => {
    const initial = window.setTimeout(() => void sync(), 0);
    window.addEventListener("online", sync);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("online", sync);
    };
  }, [sync]);
  const paused = !client && (data.paused_access?.length ?? 0) > 0;
  return (
    <div className={`trainee-shell min-h-screen ${client ? "has-bottom-nav" : ""}`}>
      <TraineeHeader name={data.profile!.name} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-9">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs text-teal">{tr("مساحتك مع مدربك")}</p>
            <h1>{tr("برنامجك، بوضوح.")}</h1>
            <p className="mt-2 text-sm text-muted">
              {tr("جدولك، وجباتك، وتقدمك مع مدربك.")}
            </p>
          </div>
          <a download href="/api/export" className="btn-secondary trainee-desktop-only">
            <Download size={15} />
            {tr("تصدير بياناتي")}
          </a>
        </div>
        {!online && (
          <p className="offline-banner" role="status">
            <CloudOff size={17} aria-hidden="true" />
            {tr("غير متصل الآن. تقدر تشوف برنامجك المحفوظ، والوزن اللي تسجله بينرسل أول ما يرجع الاتصال.")}
          </p>
        )}
        {!client ? (
          paused ? (
            <div className="card empty" data-testid="trainee-access-paused">
              <PauseCircle size={30} className="text-teal" />
              <h2>{tr("تم إيقاف وصولك مؤقتًا، تواصل مع مدربك")}</h2>
              <p>
                {data.paused_access![0].coach
                  ? tr("أوقف مدربك {0} الوصول لبوابتك مؤقتًا. بياناتك محفوظة، وترجع لك كاملة إذا أعاد تفعيلك.", data.paused_access![0].coach)
                  : tr("أوقف مدربك الوصول لبوابتك مؤقتًا. بياناتك محفوظة، وترجع لك كاملة إذا أعاد تفعيلك.")}
              </p>
            </div>
          ) : (
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
          )
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
            <CoachIdentity branding={data.coach_branding?.find(b => b.coach_id === client.coach_id)} />
            <section id="today" className="card mb-6 p-5 trainee-anchor" aria-labelledby="linked-today-title">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="eyebrow">{tr("اليوم")}</p><h2 id="linked-today-title" className="mt-2 text-xl">{publishedProgram ? tr("خطتك لهذا اليوم") : tr("لا توجد خطة منشورة حاليًا")}</h2><p className="mt-2 text-sm text-muted">{clientWeights[0] ? <>{tr("آخر وزن")}: <bdi dir="ltr">{clientWeights[0].weight}</bdi> {tr("كجم")} · {formatDate(clientWeights[0].entry_date, locale)}</> : tr("لا يوجد وزن مسجل بعد. سجّل تحديثًا سريعًا عندما يناسبك.")}</p><p className="mt-1 text-xs text-muted">{formatDate(today, locale)}</p></div>
                <TraineeCheckinStatus clientId={clientId} today={today} weights={clientWeights} records={data.management?.records ?? []} management={data.management} />
                <div className="flex flex-wrap gap-2"><a className="btn" href="#weight">{tr("تسجيل الوزن")}</a><a className="btn-secondary" href="#client-management-hub" onClick={() => window.dispatchEvent(new CustomEvent("easycoach:open-hub-tab", { detail: "progress" }))}>{tr("إرسال تحديث للمدرب")}</a></div>
              </div>
            </section>
            <div className="trainee-layout">
              <div id="training" className="trainee-training trainee-anchor">
                <ProgramView section="training" focusToday nutrition={nutrition} program={publishedProgram} />
              </div>
              <aside className="trainee-aside">
                <div id="weight" className="trainee-weight trainee-anchor">
                  {(pending > 0 || syncMessage) && (
                    <p className="sync-chip" role="status">
                      {pending > 0 ? <><CloudOff size={15} aria-hidden="true" />{tr("بانتظار المزامنة: {0}", countLabel(locale, pending, nouns.weight))}</> : tr(syncMessage)}
                    </p>
                  )}
                  <WeightPanel
                    entries={clientWeights}
                    target={
                      data.client_goals?.find((g) => g.client_id === clientId)
                        ?.target_weight
                    }
                    onSave={async (day, weight) => {
                      const keep = () => {
                        if (!queueWeight({ client_id: clientId, entry_date: day, weight })) return tr("تعذر حفظ الوزن على الجهاز. أعد المحاولة عند توفر الاتصال.");
                        setSyncMessage("");
                        return undefined;
                      };
                      if (!navigator.onLine) return keep();
                      try {
                        const r = await mutate("weight_save", {
                          client_id: clientId,
                          entry_date: day,
                          weight,
                        });
                        if (r.ok) router.refresh();
                        else return r.message;
                      } catch {
                        // The request never reached the server: keep it for later.
                        return keep();
                      }
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
                <div className="trainee-side space-y-6">
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
                              {tr(". طُبّق تمديد {0}.", countLabel(locale, f.days, nouns.day))}
                            </p>
                          ))}
                        {paylinkCoaches.includes(client.coach_id) ? null : <p className="mt-5 text-xs text-muted">{tr("للتجديد أو تعديل الباقة، أرسل طلبًا لمدربك. الدفع يتم بالاتفاق معه.")}</p>}
                      </>
                    ) : (
                      <p className="mt-4 text-sm text-muted">
                        {tr("لم يضف مدربك باقة بعد.")}
                      </p>
                    )}
                    {paylinkCoaches.includes(client.coach_id) ? (
                      <PaylinkPay subscriptions={subscriptions} payments={data.payments} today={today} />
                    ) : null}
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
                </div>
              </aside>
              <div id="nutrition" className="trainee-nutrition trainee-anchor">
                <ProgramView section="nutrition" nutrition={nutrition} program={publishedProgram} />
                {!nutrition && !publishedProgram?.content.nutrition && <p className="card p-5 text-sm text-muted">{tr("لم يضف مدربك خطة تغذية بعد.")}</p>}
              </div>
            </div>
          </>
        )}
        {client && (
          <div className="mt-7 trainee-anchor">
            <ClientHub
              key={clientId}
              clientId={clientId}
              management={data.management}
              weights={data.weights ?? []}
              program={publishedProgram}
              targetWeight={
                data.client_goals?.find((goal) => goal.client_id === clientId)
                  ?.target_weight
              }
              showRenewalRequest={subscriptions.length > 0}
              coachName={coachName}
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
      {client && <BottomNav />}
      <InstallPrompt />
      {client && (
        <PhotoConsentDialog
          open={consentPrompt.open}
          clientId={clientId}
          coachName={coachName || tr("مدربك")}
          onLater={consentPrompt.dismiss}
          onAccepted={() => {
            consentPrompt.close();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
