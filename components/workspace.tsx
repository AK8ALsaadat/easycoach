"use client";
import { useLocale } from "./locale-provider";
import { LanguageSwitch } from "./language-switch";
import { useState } from "react";
import { SessionGuard } from "./session-guard";
import { CustomExercises } from "./custom-exercises";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Menu,
  X,
  ArrowLeft,
  ArrowUpLeft,
  Bell,
  CalendarDays,
  ChevronLeft,
  ClipboardList,
  Copy,
  Check,
  Download,
  Dumbbell,
  FileText,
  LayoutDashboard,
  Link2,
  LogOut,
  Plus,
  Search,
  Settings,
  Headset,
  Trash2,
  Users,
} from "lucide-react";
import { createLink, logoutAction, type Result } from "@/app/actions";
import { manage } from "@/app/management-actions";
import {
  blankContent,
  type Client,
  type Snapshot,
  type Subscription,
  type Template,
} from "@/lib/model";
import { formatDate, riyadhToday } from "@/lib/dates";
import { financeSummary, latestSubscription } from "@/lib/subscription-period";
import { withTrainingDays } from "@/lib/program-builder";
import { auditLabel } from "@/lib/audit-labels";
import { Brand } from "./brand";
import { ActionButton, DataForm, Notice, type Field } from "./forms";
import { ProgramEditor } from "./program-editor";
import { ImportClients } from "./import-clients";
import { ClientProgress, PortalControl } from "./client-progress";
import { ExerciseCatalog } from "./exercise-catalog";
import { TemplateTools } from "./template-tools";
import { ClientHub } from "./client-hub";
import { ClientRoster } from "./client-roster";
import { ClientOverview } from "./client-overview";
import { NutritionTargetEditor } from "./nutrition-target-editor";
import { PhoneLink } from "./phone-link";
import { clientInsights } from "@/lib/client-insights";
import { SubscriptionRenewal } from "./subscription-renewal";
import { coachingAlerts } from "@/lib/coaching-alerts";
import { NotificationSettings } from "./notification-settings";
import { AccountSettings } from "./account-settings";
import { CoachBrandingSettings } from "./coach-branding-settings";
import { PaylinkSettings } from "./paylink-settings";
import { exerciseName, isCustomExercise } from "@/lib/catalog";
import { CoachToday } from "./coach-today";
import { useDialog } from "./use-dialog";
import {
  availableTemplates,
  templateLibraryState,
} from "@/lib/template-availability";
import { SupportDesk } from "./support-desk";
import { ToastHost, showToast } from "./toast";
import { ClientActionsMenu } from "./client-lifecycle";
import { TemplateNameDialog, TemplateTags, type TemplateDetails } from "./template-name-dialog";
import { isUnnamedTemplate, suggestCopyName, templateNameError } from "@/lib/template-names";
import { countLabel, formatNumber, formatSar, nouns } from "@/lib/plural";

const clientFields = (client?: Client): Field[] => [
  { name: "name", label: "اسم المتدرب", value: client?.name, required: true },
  {
    name: "email",
    label: "الإيميل",
    type: "email",
    value: client?.email,
    required: true,
  },
  {
    name: "phone",
    label: "الجوال (اختياري)",
    value: client?.phone,
    hint: "05xxxxxxxx أو +9665xxxxxxxx",
  },
];
function currentSubscription(data: Snapshot, clientId: string) {
  const today = riyadhToday();
  const all = data.subscriptions.filter((s) => s.client_id === clientId);
  return (
    all.find((s) => s.start_date <= today && s.end_date >= today) ??
    all
      .filter((s) => s.start_date > today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ??
    all.sort((a, b) => b.end_date.localeCompare(a.end_date))[0]
  );
}
function subscriptionState(data: Snapshot, sub: Subscription) {
  const today = riyadhToday();
  if (today < sub.start_date) return "لم تبدأ";
  if (today > sub.end_date) return "منتهية";
  if (
    data.freezes.some(
      (f) =>
        f.subscription_id === sub.id &&
        f.start_date <= today &&
        f.end_date >= today,
    )
  )
    return "مجمّدة";
  return "نشطة";
}
export function LinkBox({
  kind,
  clientId,
}: {
  kind: "invite" | "join";
  clientId?: string;
}) {
  const { t: tr } = useLocale();

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  return (
    <div>
      <button
        className="btn-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setResult(await createLink(kind, clientId));
          } catch {
            setResult({ ok: false, message: "تعذر إنشاء الرابط" });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Link2 size={16} />
        {busy
          ? tr("نجهّز الرابط…")
          : kind === "invite"
            ? tr("ربط حساب اختياري")
            : tr("إنشاء رابط طلب انضمام")}
      </button>
      {result?.url ? (
        <div className="mt-4 rounded-xl border bg-canvas p-4">
          <label htmlFor={`generated-${kind}`}>
            {tr("رابط خاص — شاركه بنفسك")}
          </label>
          <input
            id={`generated-${kind}`}
            className="field"
            dir="ltr"
            readOnly
            value={result.url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            className="btn-soft mt-3"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.url!);
                setResult({ ...result, message: "تم نسخ الرابط" });
              } catch {
                setResult({ ...result, message: "حدد الرابط وانسخه يدويًا" });
              }
            }}
          >
            <Copy size={14} />
            {tr("نسخ الرابط")}
          </button>
          <p className="mt-2 text-xs text-muted">
            {kind === "invite"
              ? tr(
                  "ينتهي خلال 7 أيام، لمرة واحدة، ولن يقبله إلا الحساب الموثّق بنفس إيميل المتدرب. إنشاء دعوة جديدة يلغي الدعوات السابقة.",
                )
              : tr(
                  "ينتهي خلال 30 يومًا. الطلب يحتاج موافقتك ولا يمنح وصولًا للبيانات. إنشاء رابط جديد يلغي السابق.",
                )}
          </p>
        </div>
      ) : null}
      <Notice result={result} />
    </div>
  );
}

const nav = [
  { href: "/coach", label: "نظرة عامة", icon: LayoutDashboard, key: "today" },
  { href: "/coach/clients", label: "المتدربون", icon: Users, key: "clients" },
  {
    href: "/coach/library",
    label: "مكتبة التدريب",
    icon: Dumbbell,
    key: "library",
  },
  {
    href: "/coach/finance",
    label: "الاشتراكات",
    icon: CalendarDays,
    key: "finance",
  },
  {
    href: "/coach/settings",
    label: "الإعدادات",
    icon: Settings,
    key: "settings",
  },
  { href: "/coach/support", label: "صندوق الدعم", icon: Headset, key: "support" },
];
export function Workspace({
  data,
  section,
  clientId,
  initialFilter = "",
  initialQuery = "",
  initialTab = "overview",
  tutorialDismissed = false,
  appUrl,
  local,
  supportOwner = false,
}: {
  data: Snapshot;
  section: string;
  clientId?: string;
  initialFilter?: string;
  initialQuery?: string;
  initialTab?: string;
  tutorialDismissed?: boolean;
  appUrl: string;
  local: boolean;
  supportOwner?: boolean;
}) {
  const { t: tr, language: locale } = useLocale();

  const [mobile, setMobile] = useState(false);
  const sidebarRef = useDialog<HTMLElement>(mobile, () => setMobile(false));
  const client = data.clients.find((c) => c.id === clientId && !c.archived);
  const visibleNav = nav.filter((item) => item.key !== "support" || supportOwner);
  return (
    <div className="portal-shell">
      {data.profile?.id && <SessionGuard userId={data.profile.id} />}
      <a className="skip-link" href="#portal-content">
        {tr("انتقل إلى المحتوى")}
      </a>
      {mobile && (
        <div className="sidebar-backdrop" onClick={() => setMobile(false)} />
      )}
      <aside
        ref={sidebarRef}
        tabIndex={-1}
        id="portal-sidebar"
        className={`portal-sidebar ${mobile ? "sidebar-open" : ""}`}
        aria-label={tr("التنقل في البورتال")}
      >
        <div className="sidebar-brand">
          <Brand />
          <button
            className="sidebar-close"
            aria-label={tr("إغلاق القائمة")}
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label={tr("القائمة الرئيسية")}>
          {visibleNav.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => setMobile(false)}
              aria-current={section === item.key ? "page" : undefined}
              className={`nav-item ${section === item.key ? "nav-active" : ""}`}
            >
              <item.icon size={19} />
              <span>{tr(item.label)}</span>
              {item.key === "clients" && (
                <span className="nav-count">
                  {data.clients.filter((c) => !c.archived).length}
                </span>
              )}
              {section === item.key && item.key !== "clients" && (
                <ChevronLeft size={14} className="ms-auto" />
              )}
            </Link>
          ))}
        </nav>
        <Link
          href="/coach/clients?add=1"
          onClick={() => setMobile(false)}
          className="sidebar-primary-action"
        >
          <Plus size={18} />
          <span>{tr("إضافة متدرب")}</span>
        </Link>
        <div className="sidebar-account">
          <Avatar name={data.profile!.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {data.profile!.name}
            </p>
            <p className="text-xs text-muted">{tr("حساب المدرب")}</p>
          </div>
          <form action={logoutAction}>
            <button
              className="logout-button"
              aria-label={tr("تسجيل الخروج")}
              title={tr("تسجيل الخروج")}
            >
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </aside>
      <div className="portal-body">
        <header className="portal-header">
          <div className="flex items-center gap-3">
            <button
              className="mobile-menu"
              aria-label={tr("فتح القائمة")}
              aria-controls="portal-sidebar"
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <div className="portal-breadcrumb">
              <span>{tr("إيزي كوتش")}</span>
              <ChevronLeft size={13} />
              <strong>{tr(nav.find((n) => n.key === section)?.label ?? (section === "support" ? "صندوق الدعم" : ""))}</strong>
              {client && (
                <>
                  <ChevronLeft size={13} />
                  <span>{client.name}</span>
                </>
              )}
            </div>
          </div>
          <form action="/coach/clients" className="portal-search">
            <Search size={17} />
            <input
              name="q"
              aria-label={tr("البحث في المتدربين")}
              placeholder={tr("ابحث عن متدرب…")}
              defaultValue={initialQuery}
            />
            <button type="submit" aria-label={tr("بحث")}>
              <ArrowLeft size={15} />
            </button>
          </form>
          <div className="header-tools">
            <LanguageSwitch />
            <span className="header-date">
              <CalendarDays size={16} />
              {formatDate(riyadhToday(), locale)}
            </span>
            {(() => {
              // Urgent follow-ups (new trainee messages, check-ins…) plus pending requests.
              const pending =
                coachingAlerts(data).filter((alert) => alert.urgent).length +
                data.join_requests.filter((r) => r.status === "pending").length +
                data.privacy_requests.filter((r) => r.status === "pending").length;
              return (
                <Link
                  href="/coach"
                  aria-label={pending ? tr("طلبات تحتاج مراجعتك: {0}", formatNumber(pending)) : tr("طلبات تحتاج مراجعتك")}
                  className="header-notifications"
                >
                  <Bell size={19} />
                  {pending ? <span className="header-notifications-count" aria-hidden="true">{pending > 9 ? "9+" : formatNumber(pending)}</span> : null}
                </Link>
              );
            })()}
            <span className="header-avatar">
              {data.profile!.name.slice(0, 1)}
            </span>
          </div>
        </header>
        {local ? (
          <div className="border-b border-teal/10 bg-accent/20 px-5 py-2 text-xs text-teal lg:px-9">
            {tr(
              "معاينة محلية · بيانات اصطناعية محفوظة في قاعدة بيانات على جهازك · لا رسائل حقيقية",
            )}
          </div>
        ) : null}
        <main id="portal-content" className="portal-content">
          {section === "support" && supportOwner ? (
            <SupportDesk owner />
          ) : section === "today" ? (
            <CoachToday data={data} tutorialDismissed={tutorialDismissed} />
          ) : section === "clients" ? (
            clientId ? (
              client ? (
                <ClientDetail
                  key={`${client.id}:${initialTab}`}
                  initialTab={initialTab}
                  data={data}
                  client={client}
                  appUrl={appUrl}
                />
              ) : (
                <Empty
                  title={tr("المتدرب غير متاح")}
                  text={tr("لا يوجد هذا المتدرب في حسابك.")}
                />
              )
            ) : (
              <Clients
                key={initialQuery}
                data={data}
                initialFilter={initialFilter}
                initialQuery={initialQuery}
              />
            )
          ) : section === "library" ? (
            <Library data={data} initialTab={initialTab} />
          ) : section === "finance" ? (
            <Finance data={data} />
          ) : (
            <SettingsPage data={data} />
          )}
        </main>
        <footer className="flex flex-wrap justify-between gap-3 border-t px-5 py-5 text-xs text-muted lg:px-9">
          <span>{tr("إيزي كوتش · بوابتك لإدارة التدريب")}</span>
          <Link href="/privacy" className="underline">
            {tr("الخصوصية")}
          </Link>
        </footer>
      </div>
      <SupportDesk />
      <ToastHost />
    </div>
  );
}
function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-teal/10 bg-accent/40 text-base font-semibold text-teal">
      {name.slice(0, 1)}
    </span>
  );
}
function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card empty">
      <ClipboardList className="text-teal/40" size={30} />
      <h2 className="text-ink">{title}</h2>
      <p className="max-w-md text-sm">{text}</p>
      {children}
    </div>
  );
}
function Heading({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1>{title}</h1>
        {text && <p className="mt-1 text-sm text-muted">{text}</p>}
      </div>
      {children}
    </div>
  );
}
function Clients({
  data,
  initialFilter,
  initialQuery,
}: {
  data: Snapshot;
  initialFilter: string;
  initialQuery: string;
}) {
  const {t:tr}=useLocale();
  const router=useRouter();
  const [add,setAdd]=useState(initialFilter === "add");
  const [importing,setImporting]=useState(false);
  return (
    <>
      <Heading
        title={tr("المتدربون")}
        text={tr("متابعة أوضح، وقرارات أسرع لكل متدرب.")}
      >
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={() => {
              setImporting(!importing);
              setAdd(false);
            }}
          >
            {tr("استيراد ملف")}
          </button>
          <button
            className="btn"
            onClick={() => {
              setAdd(!add);
              setImporting(false);
            }}
          >
            <Plus size={16} />
            {tr("متدرب جديد")}
          </button>
        </div>
      </Heading>
      {add ? (
        <section className="card mb-6 p-6">
          <h2 className="mb-5">{tr("إضافة متدرب")}</h2>
          <DataForm
            command="client_save"
            refreshOnSuccess={false}
            fields={clientFields()}
            label={tr("إضافة وفتح الملف")}
            onDone={(r) =>
              router.push(`/coach/clients/${(r.data as { id: string }).id}`)
            }
          />
        </section>
      ) : null}
      {importing ? (
        <section className="card mb-6 p-6">
          <ImportClients
            emails={data.clients.map((c) => c.email)}
            batches={data.management?.import_batches}
          />
          <a
            className="mt-4 inline-flex text-xs text-teal underline"
            href="/examples/clients.csv"
            download
          >
            {tr("تحميل CSV اصطناعي للتجربة")}
          </a>
        </section>
      ) : null}
      <ClientRoster data={data} initialFilter={initialFilter} initialQuery={initialQuery} onAdd={()=>{setAdd(true);setImporting(false);window.scrollTo({top:0,behavior:"smooth"});}}/>
    </>
  );
}

function ClientDetail({
  data,
  client,
  appUrl,
  initialTab,
}: {
  data: Snapshot;
  client: Client;
  appUrl: string;
  initialTab: string;
}) {
  const { t: tr, language: locale } = useLocale();

  const [tab] = useState(
    ["overview", "program", "nutrition", "finance", "profile", "progress", "tracking"].includes(
      initialTab,
    )
      ? initialTab
      : "overview",
  );
  const [templateId, setTemplateId] = useState("");
  const [loaded, setLoaded] = useState<Template | null>(null);
  const draft = data.programs.find(
    (p) => p.client_id === client.id && !p.published_at,
  );
  const published = data.programs.find(
    (p) => p.client_id === client.id && p.published_at,
  );
  const templates = availableTemplates(
    data.templates,
    data.management?.template_metadata,
  );
  const selectedTemplate = templates.find((t) => t.id === templateId);
  // Most recently used first, then most recently edited.
  const lastUsed = (id: string) => data.management?.template_metadata.find((m) => m.template_id === id)?.last_used_at ?? "";
  const startTemplates = [...templates]
    .sort((a, b) => lastUsed(b.id).localeCompare(lastUsed(a.id)) || b.updated_at.localeCompare(a.updated_at));
  const selected = loaded ?? draft ?? published;
  const insight = clientInsights(data, client.id);
  const subs = data.subscriptions.filter((s) => s.client_id === client.id);
  const whatsapp = client.phone.replace(/^0/, "966").replace(/\D/g, "");
  const programUrl = `${appUrl}/me?client=${client.id}`;
  return (
    <>
      <Link
        className="mb-5 inline-flex items-center gap-1 text-xs text-muted"
        href="/coach/clients"
      >
        {tr("المتدربون")}
        <ChevronLeft size={12} />
        {tr("ملف المتدرب")}
      </Link>
      <Heading
        title={client.name}
        text={client.email}
      >
        <div className="flex flex-wrap gap-2">
          <PhoneLink phone={client.phone}/>
          {!client.trainee_user_id && <span className="badge">{tr("بانتظار ربط الحساب")}</span>}
          <button
            className={client.trainee_user_id ? "btn-soft" : "btn-secondary"}
            title={tr("نسخ رابط البرنامج")}
            onClick={() =>
              void navigator.clipboard
                .writeText(programUrl)
                .then(() => showToast({ message: tr("تم نسخ رابط البرنامج"), tone: "success" }))
                .catch(() => window.prompt(tr("انسخ رابط البرنامج"), programUrl))
            }
          >
            {client.trainee_user_id ? <Check size={14} /> : <Copy size={14} />}
            {client.trainee_user_id ? tr("الحساب مرتبط") : tr("رابط البرنامج")}
          </button>
          {client.phone ? (
            <a
              className="btn-soft"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`مرحبًا ${client.name}، برنامجك من مدربك متاح عبر الرابط الآمن: ${programUrl} — ادخل بنفس إيميل الدعوة.`)}`}
            >
              {tr("مشاركة عبر واتساب")}
              <ArrowUpLeft size={14} />
            </a>
          ) : null}
          <ClientActionsMenu client={client} afterArchive="/coach/clients" />
        </div>
      </Heading>
      {tab === "profile" && <PortalControl
        clientId={client.id}
        link={data.portal_links?.find(
          (l) => l.client_id === client.id && !l.revoked_at,
        )}
      />}
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          ["overview", tr("ملخص المتدرب")],
          ["program", tr("تعديل الجدول")],
          ["nutrition", tr("تعديل السعرات")],
          ["finance", tr("الاشتراك والتجديد")],
          ["profile", tr("البيانات والدعوة")],
          ["progress", tr("الهدف والوزن")],
          ["tracking", tr("السجلات والمراجعات")],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={key === "overview" ? `/coach/clients/${client.id}` : key === "program" ? `/coach/clients/${client.id}/edit` : key === "nutrition" ? `/coach/clients/${client.id}/edit?tab=nutrition` : `/coach/clients/${client.id}?tab=${key}`}
            className={tab === key ? "btn" : "btn-secondary"}
            aria-current={tab === key ? "page" : undefined}
          >
            {tr(label)}
          </Link>
        ))}
      </div>
      {tab === "overview" ? <ClientOverview data={data} client={client}/> : tab === "nutrition" ? <NutritionTargetEditor data={data} client={client}/> : tab === "tracking" ? (
        <ClientHub
          clientId={client.id}
          client={client}
          management={data.management}
          weights={data.weights ?? []}
          program={published}
          targetWeight={
            data.client_goals?.find((goal) => goal.client_id === client.id)
              ?.target_weight
          }
          coach
        />
      ) : tab === "progress" ? (
        <ClientProgress data={data} clientId={client.id} />
      ) : tab === "program" ? (
        <section className="card p-5 sm:p-7">
          <div className="section-title">
            <div>
              <h2>{tr("مسودة البرنامج")}</h2>
              <p className="mt-1 text-xs text-muted">
                {published
                  ? tr(
                      "آخر نشر: {0}",
                      String(formatDate(published.published_at!, locale)),
                    )
                  : tr("ما فيه نسخة منشورة للمتدرب بعد.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label={tr("قالب البداية")}
                className="field max-w-60"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">{tr("ابدأ من قالب…")}</option>
                {startTemplates.map((t) => {
                  const unnamed = isUnnamedTemplate(t.name);
                  const exercises = t.content.days.reduce((sum, d) => sum + d.exercises.length, 0);
                  return (
                    <option value={t.id} key={t.id} disabled={unnamed}>
                      {unnamed ? tr("{0} — بدون اسم، سمِّه من المكتبة أولًا", t.name) : `${t.name} · ${countLabel(locale, t.content.days.length, nouns.day)} · ${countLabel(locale, exercises, nouns.exercise)}`}
                    </option>
                  );
                })}
              </select>
              <button
                className="btn-secondary"
                disabled={!selectedTemplate || isUnnamedTemplate(selectedTemplate.name)}
                onClick={() => {
                  if (!selectedTemplate || isUnnamedTemplate(selectedTemplate.name)) return;
                  void manage("template_touch", { id: selectedTemplate.id }).catch(() => undefined);
                  if (
                    draft &&
                    !window.confirm(
                      "سيستبدل محتوى المسودة بنسخة من القالب. النسخة المنشورة لن تتغير. تتابع؟",
                    )
                  )
                    return;
                  setLoaded(
                    structuredClone(selectedTemplate),
                  );
                }}
              >
                {tr("استخدام نسخة مستقلة")}
              </button>
            </div>
          </div>
          <ProgramEditor
            key={
              loaded
                ? `template-${loaded.id}`
                : (draft?.id ?? published?.id ?? client.id)
            }
            initial={{...(selected?.content ?? blankContent),nutrition:{...(selected?.content.nutrition ?? blankContent.nutrition),...insight.nutrition}}}
            separateNutrition
            name={selected?.name ?? "برنامج جديد"}
            id={draft?.id}
            editRevision={draft?.edit_revision}
            clientId={client.id}
            library={data.exercises}
          />
        </section>
      ) : tab === "finance" ? (
        <div className="space-y-6">
          <div className="card p-6"><SubscriptionRenewal client={client} subscriptions={data.subscriptions} /></div>
          {subs.length ? (
            subs.map((s) => (
              <SubscriptionCard
                data={data}
                sub={s}
                client={client}
                appUrl={appUrl}
                key={s.id}
              />
            ))
          ) : (
            <Empty
              title={tr("ما فيه اشتراك بعد")}
              text={tr(
                "حدد مدة الاشتراك أو اختر تاريخ نهايته.",
              )}
            />
          )}
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section className="card p-6">
            <h2 className="mb-5">{tr("بيانات المتدرب")}</h2>
            <DataForm
              command="client_save"
              base={{ id: client.id }}
              fields={clientFields(client)}
            />
            <p className="mt-4 text-xs text-muted">
              {tr(
                "تغيير الإيميل يلغي ارتباط الحساب والدعوات السابقة؛ أنشئ دعوة جديدة للإيميل الصحيح.",
              )}
            </p>
          </section>
          <section className="card space-y-5 p-6">
            <h2>{tr("حساب المتدرب — اختياري")}</h2>
            <p className="text-sm text-muted">
              {tr(
                "رابط الدخول أعلاه يعمل دون حساب. استخدم هذا الخيار فقط لربط حساب موثّق بنفس إيميل المتدرب، مع الاحتفاظ ببرنامجه وسجله.",
              )}
            </p>
            <LinkBox kind="invite" clientId={client.id} />
            {data.invitations
              .filter(
                (i) =>
                  i.client_id === client.id && !i.revoked_at && !i.consumed_at,
              )
              .map((i) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
                  key={i.id}
                >
                  <p className="text-xs text-muted">
                    {tr("تنتهي")} {formatDate(i.expires_at, locale)}
                  </p>
                  <ActionButton command="invite_revoke" payload={{ id: i.id }}>
                    {tr("إلغاء الدعوة")}
                  </ActionButton>
                </div>
              ))}
          </section>
        </div>
      )}
    </>
  );
}

function SubscriptionCard({
  data,
  sub,
  client,
  appUrl,
}: {
  data: Snapshot;
  sub: Subscription;
  client: Client;
  appUrl: string;
}) {
  const { t: tr, language: locale } = useLocale();

  const frozen = data.freezes.filter((f) => f.subscription_id === sub.id);
  const whatsapp = client.phone.replace(/^0/, "966").replace(/\D/g, "");
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b p-6">
        <div>
          <h2>{sub.name}</h2>
          <p className="mt-1 text-xs text-muted">
            {formatDate(sub.start_date, locale)} ←{" "}
            {formatDate(sub.end_date, locale)}
          </p>
          <p className="subscription-value mt-2">
            <span>{tr("قيمة الاشتراك")}</span> <bdi>{formatSar(sub.price, locale)}</bdi>
          </p>
        </div>
        <span className="badge bg-accent/30 text-teal">
          {subscriptionState(data, sub)}
        </span>
      </div>
      <div className="space-y-5 border-t p-6">
        <details>
          <summary className="text-sm">{tr("تجميد الباقة")}</summary>
          <p className="mt-3 mb-4 text-xs text-muted">
            {tr(
              "النهاية تتمدد بعدد أيام التجميد شاملًا أول وآخر يوم، لمرة واحدة. لا نقبل فترات متداخلة.",
            )}
          </p>
          <DataForm
            command="freeze_apply"
            idempotent
            base={{ subscription_id: sub.id }}
            fields={[
              {
                name: "start_date",
                label: "أول يوم تجميد",
                type: "date",
                value: riyadhToday(),
                required: true,
              },
              {
                name: "end_date",
                label: "آخر يوم تجميد",
                type: "date",
                value: riyadhToday(),
                required: true,
              },
            ]}
            label={tr("تطبيق التجميد والتمديد")}
          />
          {frozen.map((f) => (
            <p key={f.id} className="mt-3 rounded-xl bg-canvas p-3 text-xs">
              {formatDate(f.start_date, locale)} —{" "}
              {formatDate(f.end_date, locale)} {tr("· طُبّق تمديد")}
              {countLabel(locale, f.days, nouns.day)}
            </p>
          ))}
        </details>
        {client.phone ? (
          <a
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`مرحبًا ${client.name}، تنتهي باقة ${sub.name} بتاريخ ${formatDate(sub.end_date)}. للتجديد تواصل معي. تفاصيل اشتراكك: ${appUrl}/me`)}`}
          >
            {tr("فتح مسودة تذكير تجديد")}
            <ArrowUpLeft size={14} />
          </a>
        ) : null}
      </div>
    </section>
  );
}
const LIBRARY_TABS = ["catalog", "templates", "exercises"] as const;
function Library({ data, initialTab }: { data: Snapshot; initialTab?: string }) {
  const { t: tr, language: locale } = useLocale();
  const router = useRouter();
  const [deletingTemplate, setDeletingTemplate] = useState("");
  const [templateResult, setTemplateResult] = useState<Result | null>(null);
  const templateKind = (id: string) => data.management?.template_metadata.find(meta => meta.template_id === id)?.kind ?? "workout";

  // The tab lives in the URL. Saving a template revalidates the layout, and a
  // tab kept only in component state was lost on that re-render, dropping the
  // coach back into the exercise guide right after a successful save.
  const [tab, setTab] = useState(() =>
    LIBRARY_TABS.includes((initialTab ?? "") as (typeof LIBRARY_TABS)[number]) ? initialTab! : "catalog",
  );
  const openTab = (next: string) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "catalog") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  };
  const [template, setTemplate] = useState<Template | null>(null);
  const [editor, setEditor] = useState(false);
  const [templateRevision, setTemplateRevision] = useState(0);
  const [nameDialog, setNameDialog] = useState<null | { key: number; mode: "create" | "copy" | "rename"; initial: Partial<TemplateDetails>; seed?: Template["content"]; source?: Template }>(null);
  const templates = availableTemplates(
    data.templates,
    data.management?.template_metadata,
  );
  const templateState = templateLibraryState(data.templates, templates);
  const metaFor = (id: string) => data.management?.template_metadata.find((meta) => meta.template_id === id);
  // Nothing is created until the coach names the template.
  const createTemplate = (seed = blankContent, suggested = "") => {
    openTab("templates");
    setNameDialog({ key: Date.now(), mode: "create", initial: { name: suggested }, seed: structuredClone(seed) });
  };
  const openEditor = (next: Template) => {
    setTemplate(next);
    setTemplateRevision((value) => value + 1);
    setEditor(true);
    openTab("templates");
  };
  async function submitName(details: TemplateDetails): Promise<Result> {
    if (!nameDialog) return { ok: false, message: "" };
    const tags = { goal: details.goal, level: details.level, days_per_week: details.days_per_week };
    if (nameDialog.mode === "create") {
      // Days per week creates that many named days up front (اليوم الأول… الرابع).
      const seed = withTrainingDays(nameDialog.seed ?? blankContent, details.days_per_week);
      const response = await manage("template_save_typed", { name: details.name, content: seed, kind: "workout", description: "", archived: false, ...tags });
      if (!response.ok) return response;
      const saved = response.data as Template;
      setNameDialog(null);
      openEditor({ ...saved, content: seed });
      router.refresh();
      return response;
    }
    const source = nameDialog.source!;
    const meta = metaFor(source.id);
    if (nameDialog.mode === "copy") {
      const response = await manage("template_duplicate", { id: source.id, name: details.name });
      if (!response.ok) return response;
      const saved = response.data as Template;
      await manage("template_meta", { id: saved.id, description: meta?.description ?? "", archived: false, kind: meta?.kind ?? "workout", ...tags });
      setNameDialog(null);
      openEditor({ ...saved, content: source.content });
      setTemplateResult({ ok: true, message: tr("تم إنشاء {0}", details.name) });
      router.refresh();
      return response;
    }
    const response = await manage("template_rename", { id: source.id, name: details.name });
    if (!response.ok) return response;
    await manage("template_meta", { id: source.id, description: meta?.description ?? "", archived: meta?.archived ?? false, kind: meta?.kind ?? "workout", ...tags });
    setNameDialog(null);
    setTemplateResult({ ok: true, message: tr("تم حفظ اسم القالب") });
    router.refresh();
    return response;
  }
  return (
    <>
      {nameDialog && (
        <TemplateNameDialog
          key={nameDialog.key}
          open
          mode={nameDialog.mode}
          initial={nameDialog.initial}
          existing={data.templates}
          selfId={nameDialog.mode === "rename" ? nameDialog.source?.id : undefined}
          onClose={() => setNameDialog(null)}
          onSubmit={submitName}
        />
      )}
      <Heading title={tr("مكتبة التدريب")} text="">
        <button
          className="btn"
          onClick={() => createTemplate()}
        >
          <Plus size={16} />
          {tr("قالب جديد")}
        </button>
      </Heading>
      <div
        className="library-tabs"
        role="tablist"
        aria-label={tr("أقسام مكتبة التدريب")}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const tabs = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="tab"]',
            ),
          );
          const index = tabs.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : (index + (event.key === "ArrowLeft" ? 1 : -1) + tabs.length) %
                  tabs.length;
          tabs[next].focus();
          tabs[next].click();
        }}
      >
        <button
          id="library-tab-catalog"
          role="tab"
          aria-controls="library-panel-catalog"
          aria-selected={tab === "catalog"}
          tabIndex={tab === "catalog" ? 0 : -1}
          className={tab === "catalog" ? "library-tab-active" : ""}
          onClick={() => {
            openTab("catalog");
          }}
        >
          {tr("دليل التمارين · 876")}
        </button>
        <button
          id="library-tab-templates"
          role="tab"
          aria-controls="library-panel-templates"
          aria-selected={tab === "templates"}
          tabIndex={tab === "templates" ? 0 : -1}
          className={tab === "templates" ? "library-tab-active" : ""}
          onClick={() => {
            openTab("templates");
          }}
        >
          {tr("قوالب البرامج")}
        </button>
        <button
          id="library-tab-exercises"
          role="tab"
          aria-controls="library-panel-exercises"
          aria-selected={tab === "exercises"}
          tabIndex={tab === "exercises" ? 0 : -1}
          className={tab === "exercises" ? "library-tab-active" : ""}
          onClick={() => openTab("exercises")}
        >
          {tr("تماريني الخاصة")}
        </button>
      </div>
      <div
        id="library-panel-catalog"
        role="tabpanel"
        aria-labelledby="library-tab-catalog"
        hidden={tab !== "catalog"}
      >
        <ExerciseCatalog
          embedded
          custom={data.exercises}
          onConfirm={(exercises) => {
            const seed = structuredClone(blankContent);
            seed.days[0].exercises = exercises.map(exercise=>isCustomExercise(exercise)
              ? {name:exercise.name,description:exercise.custom.description,video:exercise.custom.video,...(exercise.custom.mediaId?{mediaId:exercise.custom.mediaId}:{}),sets:3,reps:"10–12",rest:90}
              : {name:exerciseName(exercise,locale),catalogId:exercise.id,description:"",video:"",sets:3,reps:"10–12",rest:90});
            const first = exercises[0];
            const suggested = ("برنامج " + (isCustomExercise(first) ? first.name : exerciseName(first,locale))).slice(0, 60).trim();
            createTemplate(seed, templateNameError(suggested, data.templates) ? "" : suggested);
          }}
        />
      </div>
      <div
        id="library-panel-templates"
        role="tabpanel"
        aria-labelledby="library-tab-templates"
        hidden={tab !== "templates"}
      >
        <TemplateTools data={data} />
        <Notice result={templateResult} />
        {editor ? (
          <section className="card p-6">
            <button
              className="mb-5 text-xs text-muted"
              onClick={() => setEditor(false)}
            >
              {tr("رجوع للقوالب")}
            </button>
            {template && <ProgramEditor
              key={template.id + ":" + templateRevision}
              initial={template.content}
              name={template.name}
              id={template.id}
              templateMeta={metaFor(template.id)}
              siblingTemplates={data.templates}
              library={data.exercises}
            />}
          </section>
        ) : templateState.kind === "active" ? (
          <div
            className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3"
            data-testid="active-template-grid"
          >
            {templateState.activeTemplates.map((t) => {
              const meta = metaFor(t.id);
              const unnamed = isUnnamedTemplate(t.name);
              return (
                <article key={t.id} className="card p-6">
                  <span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-accent/30 text-teal">
                    <ClipboardList size={23} />
                  </span>
                  <h2 className="flex flex-wrap items-center gap-2">{t.name}{unnamed && <span className="badge badge-warning">{tr("بدون اسم")}</span>}</h2>
                  <p className="mt-2 text-sm text-muted">
                    {templateKind(t.id) === "workout" ? <>{countLabel(locale, t.content.days.length, nouns.day)} · {countLabel(locale, t.content.days.reduce((sum, d) => sum + d.exercises.length, 0), nouns.exercise)}</> : tr(templateKind(t.id) === "nutrition_targets" ? "تغذية مع أهداف مقترحة" : "تغذية عامة دون أهداف مشتركة")}
                  </p>
                  <TemplateTags goal={meta?.goal} level={meta?.level} days={meta?.days_per_week} />
                  {unnamed && (
                    <div className="mt-3 rounded-xl bg-canvas p-3 text-xs leading-6">
                      <p>{tr("سمِّ القالب قبل استخدامه في برنامج متدرب.")}</p>
                      <button type="button" className="btn-soft mt-2" onClick={() => setNameDialog({ key: Date.now(), mode: "rename", initial: { name: "", goal: meta?.goal ?? null, level: meta?.level ?? null, days_per_week: meta?.days_per_week ?? null }, source: t })}>
                        {tr("سمِّ القالب")}
                      </button>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    {tr("آخر تعديل")} {formatDate(t.updated_at, locale)}
                  </p>
                  <div className="mt-6 flex gap-2">
                    <button className="btn-secondary text-red-700" aria-label={tr("حذف القالب ") + t.name} disabled={Boolean(deletingTemplate)} onClick={async () => {
                      if (!window.confirm("حذف القالب نهائيًا؟ برامج المتدربين المستقلة وسجل التغذية سيبقيان كما هما.")) return;
                      setDeletingTemplate(t.id);
                      try { const result = await manage("template_delete", { id: t.id }); setTemplateResult(result); if (result.ok) router.refresh(); }
                      catch { setTemplateResult({ ok: false, message: "تعذر الاتصال. حدّث قائمة القوالب قبل إعادة المحاولة." }); }
                      finally { setDeletingTemplate(""); }
                    }}><Trash2 size={14} />{tr(deletingTemplate === t.id ? "جارٍ الحذف…" : "حذف")}</button>
                    <button
                      className="btn-secondary"
                      onClick={() => openEditor(t)}
                    >
                      {tr("فتح وتعديل")}
                    </button>
                    <button
                      className="btn-soft"
                      onClick={() => setNameDialog({ key: Date.now(), mode: "copy", initial: { name: unnamed ? "" : suggestCopyName(t.name, data.templates), goal: meta?.goal ?? null, level: meta?.level ?? null, days_per_week: meta?.days_per_week ?? null }, source: t })}
                    >
                      <Copy size={14} />
                      {tr("نسخ")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : templateState.kind === "all-archived" ? (
          <Empty
            title={tr("جميع قوالبك مؤرشفة")}
            text={tr(
              "استعد قالبًا من إدارة القوالب أو أنشئ قالبًا جديدًا لبدء برنامج جديد.",
            )}
          >
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                className="btn-secondary"
                onClick={() =>
                  document
                    .getElementById("template-management")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                {tr("إدارة القوالب واستعادة قالب")}
              </button>
              <button className="btn" onClick={() => createTemplate()}>
                <Plus size={16} />
                {tr("إنشاء قالب جديد")}
              </button>
            </div>
          </Empty>
        ) : (
          <Empty
            title={tr("مكتبتك تبدأ من أول قالب")}
            text={tr(
              "أنشئ قالبًا ثم انسخ محتواه لكل متدرب. التعديل على النسخة لا يغيّر القالب.",
            )}
          />
        )}
      </div>
      <div
        id="library-panel-exercises"
        role="tabpanel"
        aria-labelledby="library-tab-exercises"
        hidden={tab !== "exercises"}
      >
        <CustomExercises data={data} />
      </div>
    </>
  );
}
function Finance({ data }: { data: Snapshot }) {
  const { t: tr, language: locale } = useLocale();
  const clients = data.clients.filter(c => !c.archived);
  const summary = financeSummary(data.subscriptions, clients.map(c => c.id), riyadhToday());
  return <>
    <Heading title={tr("الاشتراكات")} text={tr("إدارة الاشتراكات للمدرب. سجّل المدة والقيمة هنا؛ الدفع يتم خارج المنصة.")} />
    <section className="finance-summary" aria-label={tr("ملخص الاشتراكات")}>
      <div><span>{tr("إيراد الشهر الحالي")}</span><strong><bdi>{formatSar(summary.monthRevenue, locale)}</bdi></strong><small>{tr("قيمة الاشتراكات التي تبدأ هذا الشهر")}</small></div>
      <div><span>{tr("المتوقع من التجديدات خلال 30 يومًا")}</span><strong><bdi>{formatSar(summary.renewalsDue, locale)}</bdi></strong><small>{tr("تنتهي قريبًا: {0}", countLabel(locale, summary.renewalsCount, nouns.subscription))}</small></div>
      <div><span>{tr("اشتراكات منتهية")}</span><strong><bdi>{formatNumber(summary.expired)}</bdi></strong><small>{tr("متدربون نشطون بلا اشتراك ساري")}</small></div>
    </section>
    <section className="card overflow-hidden"><div className="overflow-x-auto"><table>
      <thead><tr><th>{tr("المتدربون")}</th><th>{tr("بداية الاشتراك")}</th><th>{tr("نهاية الاشتراك")}</th><th>{tr("القيمة")}</th><th>{tr("الحالة")}</th><th>{tr("تجديد الاشتراك")}</th></tr></thead>
      <tbody>{clients.map(client => {
        const sub = currentSubscription(data, client.id);
        return <tr key={client.id}><td><Link className="text-teal" href={`/coach/clients/${client.id}?tab=finance`}>{client.name}</Link></td><td>{sub ? formatDate(sub.start_date, locale) : "—"}</td><td>{sub ? formatDate(latestSubscription(data.subscriptions, client.id)!.end_date, locale) : "—"}</td><td>{sub ? <bdi>{formatSar(sub.price, locale)}</bdi> : "—"}</td><td>{sub ? subscriptionState(data, sub) : tr("بدون اشتراك")}</td><td><SubscriptionRenewal client={client} subscriptions={data.subscriptions} /></td></tr>;
      })}</tbody>
    </table></div>{!clients.length && <div className="empty">{tr("أضف أول متدرب لبدء المتابعة.")}</div>}</section>
  </>;
}
function JoinRequests({
  data,
  compact = false,
}: {
  data: Snapshot;
  compact?: boolean;
}) {
  const { t: tr } = useLocale();

  const pending = data.join_requests.filter((r) => r.status === "pending");
  return (
    <section className="card p-6">
      <div className="section-title">
        <h2>{tr("طلبات الانضمام")}</h2>
        <span className="badge">{pending.length}</span>
      </div>
      {!pending.length ? (
        <p className="text-sm leading-7 text-muted">
          {tr(
            "ما فيه طلبات تنتظر موافقتك. شارك رابط طلب الانضمام من الإعدادات.",
          )}
        </p>
      ) : (
        pending.slice(0, compact ? 3 : 100).map((r) => (
          <div className="border-t py-4" key={r.id}>
            <p className="font-medium">{r.name}</p>
            <p className="mb-3 text-xs text-muted">{r.email}</p>
            <div className="flex gap-2">
              <ActionButton
                command="join_review"
                payload={{ id: r.id, approve: true }}
                className="btn-soft"
              >
                {tr("موافقة وإضافة")}
              </ActionButton>
              <ActionButton
                command="join_review"
                payload={{ id: r.id, approve: false }}
              >
                {tr("رفض")}
              </ActionButton>
            </div>
          </div>
        ))
      )}
      {compact ? (
        <Link
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-teal"
          href="/coach/settings"
        >
          {tr("إدارة الطلبات")}
          <ArrowLeft size={13} />
        </Link>
      ) : (
        <p className="mt-4 text-xs text-muted">
          {tr(
            "الموافقة تضيف المتدرب فقط. أنشئ دعوته من ملفه لربط الحساب بعد التحقق.",
          )}
        </p>
      )}
    </section>
  );
}
function SettingsPage({ data }: { data: Snapshot }) {
  const { t: tr, language: locale } = useLocale();

  return (
    <>
      <Heading
        title={tr("إعدادات مساحتك")}
        text={tr("روابط الدعوة، طلبات البيانات، وسجل التغييرات.")}
      />
      <NotificationSettings data={data} />
      <AccountSettings name={data.profile!.name} />
      <CoachBrandingSettings branding={data.coach_branding?.find(b => b.coach_id === data.profile?.id)} defaultName={data.profile!.name} />
      <PaylinkSettings />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-3">{tr("رابط طلب الانضمام")}</h2>
          <p className="mb-5 text-sm leading-7 text-muted">
            {tr(
              "يقدم المتدرب طلبًا، وتراجعه أنت. لا يُنشأ ارتباط حساب قبل الدعوة والتحقق من الإيميل.",
            )}
          </p>
          <LinkBox kind="join" />
        </section>
        <section className="card p-6">
          <h2>{tr("تصدير البيانات")}</h2>
          <p className="mt-3 mb-5 text-sm text-muted">
            {tr("تصدير خاص بمتدربيك فقط. احتفظ بالملفات في مكان آمن.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <a download href="/api/export" className="btn-secondary">
              <Download size={16} />
              {tr("كل بياناتك (JSON)")}
            </a>
            <a download href="/api/export?type=clients" className="btn-soft">
              {tr("المتدربون (CSV)")}
            </a>
          </div>
          <Link
            href="/privacy"
            className="mt-5 inline-flex items-center gap-2 text-xs text-teal"
          >
            <FileText size={14} />
            {tr("إشعار الخصوصية للمراجعة")}
          </Link>
        </section>
        <JoinRequests data={data} />
        <section className="card p-6">
          <h2 className="mb-5">{tr("طلبات التصحيح والحذف")}</h2>
          {data.privacy_requests.filter((r) => r.status === "pending")
            .length ? (
            data.privacy_requests
              .filter((r) => r.status === "pending")
              .map((r) => (
                <details className="border-t py-4" key={r.id}>
                  <summary>
                    {data.clients.find((c) => c.id === r.client_id)?.name} ·{" "}
                    {r.kind === "deletion"
                      ? tr("حذف البيانات")
                      : tr("تصحيح البيانات")}
                  </summary>
                  <p className="my-4 whitespace-pre-wrap text-sm text-muted">
                    {r.details}
                  </p>
                  {r.kind === "deletion" ? (
                    <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                      {tr(
                        "سيُحذف البرنامج والاسم والإيميل والجوال والدعوات ويُلغى الوصول. تبقى أرقام الدفعات مجهّلة في السجل؛ هذه سياسة أولية تحتاج مراجعة قبل الإطلاق.",
                      )}
                    </p>
                  ) : (
                    <Link
                      href={`/coach/clients/${r.client_id}`}
                      className="mb-4 inline-block text-xs text-teal underline"
                    >
                      {tr("عدّل البيانات في ملف المتدرب أولًا")}
                    </Link>
                  )}
                  <DataForm
                    command="privacy_fulfill"
                    base={{ id: r.id }}
                    fields={[
                      {
                        name: "resolution",
                        label: "وثّق ما تم تنفيذه",
                        type: "textarea",
                        required: true,
                      },
                    ]}
                    label={
                      r.kind === "deletion"
                        ? tr("تنفيذ الحذف وإلغاء الوصول")
                        : tr("توثيق إتمام التصحيح")
                    }
                  />
                </details>
              ))
          ) : (
            <p className="text-sm text-muted">{tr("لا توجد طلبات معلّقة.")}</p>
          )}
        </section>
      </div>
      <section className="card mt-7 overflow-hidden">
        <h2 className="p-6">{tr("آخر التغييرات الموثّقة")}</h2>
        <div className="max-h-80 overflow-auto">
          <table>
            <thead>
              <tr>
                <th>{tr("الوقت")}</th>
                <th>{tr("العملية")}</th>
                <th>{tr("التفاصيل")}</th>
                <th>{tr("مرجع السجل")}</th>
              </tr>
            </thead>
            <tbody>
              {data.audit.map((a) => (
                <tr key={a.id}>
                  <td className="text-xs">
                    {formatDate(a.created_at, locale)}
                  </td>
                  <td className="text-xs">
                    {(() => {
                      // "حذف قياس وزن — سارة"; the trainee is resolved from the id, never stored by name.
                      const clientName = data.clients.find((c) => c.id === (a.client_id ?? a.entity_id))?.name;
                      return clientName ? `${tr(auditLabel(a.action))} — ${clientName}` : tr(auditLabel(a.action));
                    })()}
                  </td>
                  <td className="text-xs text-muted">{a.detail ? tr(a.detail) : "—"}</td>
                  <td className="font-mono text-xs text-muted">
                    {a.entity_id?.slice(0, 12) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
