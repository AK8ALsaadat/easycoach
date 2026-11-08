"use client";
import { useLocale } from "./locale-provider";
import { LanguageSwitch } from "./language-switch";
import { useState } from "react";
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
  Download,
  Dumbbell,
  FileText,
  LayoutDashboard,
  Link2,
  LogOut,
  Plus,
  Search,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { createLink, logoutAction, type Result } from "@/app/actions";
import {
  blankContent,
  type Client,
  type Snapshot,
  type Subscription,
  type Template,
} from "@/lib/model";
import { addDays, formatDate, money, riyadhToday } from "@/lib/dates";
import { Brand } from "./brand";
import { ActionButton, DataForm, Notice, type Field } from "./forms";
import { ProgramEditor } from "./program-editor";
import { ImportClients } from "./import-clients";
import { ClientProgress, PortalControl } from "./client-progress";
import { ExerciseCatalog } from "./exercise-catalog";
import { TemplateTools } from "./template-tools";
import { ClientHub } from "./client-hub";
import { coachingAlerts } from "@/lib/coaching-alerts";
import { NotificationSettings } from "./notification-settings";
import { AccountSettings } from "./account-settings";
import { ManagementButton } from "./management-button";
import { exerciseName } from "@/lib/catalog";
import { CoachToday } from "./coach-today";
import { useDialog } from "./use-dialog";

const methods = [
  { value: "bank", label: "تحويل بنكي" },
  { value: "cash", label: "نقدي" },
  { value: "other", label: "أخرى" },
];
const clientFields = (client?: Client): Field[] => [
  { name: "name", label: "اسم العميل", value: client?.name, required: true },
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
function paid(data: Snapshot, id: string) {
  return data.payments
    .filter((p) => p.subscription_id === id)
    .reduce((sum, p) => sum + Number(p.amount), 0);
}
function remaining(data: Snapshot, sub: Subscription) {
  return Math.max(0, Number(sub.price) - paid(data, sub.id));
}
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
            ? tr("إنشاء دعوة آمنة")
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
                  "ينتهي خلال 7 أيام، لمرة واحدة، ولن يقبله إلا الحساب الموثّق بنفس إيميل العميل. إنشاء دعوة جديدة يلغي الدعوات السابقة.",
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
    label: "الاشتراكات والمالية",
    icon: Wallet,
    key: "finance",
  },
  {
    href: "/coach/settings",
    label: "الإعدادات",
    icon: Settings,
    key: "settings",
  },
];
export function Workspace({
  data,
  section,
  clientId,
  initialFilter = "",
  initialQuery = "",
  initialTab = "program",
  appUrl,
  local,
}: {
  data: Snapshot;
  section: string;
  clientId?: string;
  initialFilter?: string;
  initialQuery?: string;
  initialTab?: string;
  appUrl: string;
  local: boolean;
}) {
  const { t: tr, language: locale } = useLocale();

  const [mobile, setMobile] = useState(false);
  const sidebarRef = useDialog<HTMLElement>(mobile, () => setMobile(false));
  const client = data.clients.find((c) => c.id === clientId && !c.archived);
  return (
    <div className="portal-shell">
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
          {nav.map((item) => (
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
              <strong>{tr(nav.find((n) => n.key === section)?.label)}</strong>
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
            <Link
              href="/coach"
              aria-label={tr("طلبات تحتاج مراجعتك")}
              className="header-notifications"
            >
              <Bell size={19} />
              {coachingAlerts(data).some((alert) => alert.urgent) ||
              data.join_requests.some((r) => r.status === "pending") ||
              data.privacy_requests.some((r) => r.status === "pending") ? (
                <span />
              ) : null}
            </Link>
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
          {data.demo && (
            <p
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 mb-5"
            >
              {tr(
                "حساب تجريبي عام — جميع البيانات هنا وهمية ومشتركة للاختبار. لا تدخل بيانات عملاء حقيقية.",
              )}
            </p>
          )}
          {section === "today" ? (
            <CoachToday data={data} />
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
                  title={tr("العميل غير متاح")}
                  text={tr("لا يوجد هذا العميل في حسابك.")}
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
            <Library data={data} />
          ) : section === "finance" ? (
            <Finance data={data} />
          ) : (
            <SettingsPage data={data} />
          )}
        </main>
        <footer className="flex flex-wrap justify-between gap-3 border-t px-5 py-5 text-xs text-muted lg:px-9">
          <span>{tr("إيزي كوتش · بوابتك لإدارة التدريب")}</span>
          <Link href="/privacy" className="underline">
            {tr("الخصوصية · مسودة للمراجعة")}
          </Link>
        </footer>
      </div>
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
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="card empty">
      <ClipboardList className="text-teal/40" size={30} />
      <h2 className="text-ink">{title}</h2>
      <p className="max-w-md text-sm">{text}</p>
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
function ClientTable({ data, clients }: { data: Snapshot; clients: Client[] }) {
  const { t: tr, language: locale } = useLocale();

  if (!clients.length)
    return (
      <div className="empty">
        <Users size={28} />
        <p>{tr("ما فيه عملاء في هذا العرض.")}</p>
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>{tr("العميل")}</th>
            <th>{tr("البرنامج")}</th>
            <th>{tr("الاشتراك")}</th>
            <th>{tr("المتبقي")}</th>
            <th aria-label={tr("فتح ملف العميل")} />
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => {
            const program = data.programs.find(
              (p) => p.client_id === c.id && p.published_at,
            );
            const sub = currentSubscription(data, c.id);
            const balance = data.subscriptions
              .filter((s) => s.client_id === c.id)
              .reduce((n, s) => n + remaining(data, s), 0);
            return (
              <tr key={c.id}>
                <td>
                  <Link
                    href={`/coach/clients/${c.id}`}
                    className="flex items-center gap-3"
                  >
                    <Avatar name={c.name} />
                    <div>
                      <p className="whitespace-nowrap font-medium">{c.name}</p>
                      <p className="text-xs text-muted">
                        {c.trainee_user_id ? tr("حساب مرتبط") : c.email}
                      </p>
                    </div>
                  </Link>
                </td>
                <td>
                  <span
                    className={`badge ${program ? "bg-accent/30 text-teal" : "bg-amber-50 text-amber-800"}`}
                  >
                    {program ? tr("منشور") : tr("يحتاج برنامجًا")}
                  </span>
                </td>
                <td>
                  {sub ? (
                    <div>
                      <p className="text-xs">{subscriptionState(data, sub)}</p>
                      <p className="text-xs text-muted">
                        {tr("حتى")} {formatDate(sub.end_date, locale)}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">
                      {tr("بدون باقة")}
                    </span>
                  )}
                </td>
                <td
                  className={
                    balance ? "font-medium text-amber-800" : "text-muted"
                  }
                >
                  {money(balance, locale)}
                </td>
                <td>
                  {c.archived ? (
                    <ManagementButton
                      command="client_archive"
                      payload={{ client_id: c.id, archived: false }}
                    >
                      {tr("إعادة التفعيل")}
                    </ManagementButton>
                  ) : (
                    <Link
                      aria-label={tr("فتح ملف {0}", String(c.name))}
                      href={`/coach/clients/${c.id}`}
                      className="inline-flex size-8 items-center justify-center rounded-lg border"
                    >
                      <ChevronLeft size={15} />
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const { t: tr } = useLocale();

  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(
    initialFilter === "add" ? "" : initialFilter,
  );
  const [add, setAdd] = useState(initialFilter === "add");
  const [importing, setImporting] = useState(false);
  const today = riyadhToday();
  const [sort, setSort] = useState("newest");
  const alerts = coachingAlerts(data);
  const clients = data.clients
    .filter(
      (c) =>
        (filter === "archived" ? c.archived : !c.archived) &&
        `${c.name} ${c.email} ${c.phone}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .filter((c) =>
      filter === "program"
        ? !data.programs.some((p) => p.client_id === c.id && p.published_at)
        : filter === "renew"
          ? Boolean(
              currentSubscription(data, c.id) &&
              currentSubscription(data, c.id)!.end_date <= addDays(today, 7),
            )
          : filter === "balance"
            ? data.subscriptions.some(
                (s) => s.client_id === c.id && remaining(data, s) > 0,
              )
            : filter === "active" || filter === "inactive" || filter === "new"
              ? (data.management?.details.find(
                  (detail) => detail.client_id === c.id,
                )?.status ?? "active") === filter
              : ["checkin", "adherence", "stalled"].includes(filter)
                ? alerts.some(
                    (alert) => alert.clientId === c.id && alert.kind === filter,
                  )
                : true,
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "ar")
        : sort === "oldest"
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at),
    );
  return (
    <>
      <Heading
        title={tr("العملاء")}
        text={tr("كل عميل ببرنامجه واشتراكه وتفاصيله.")}
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
            {tr("عميل جديد")}
          </button>
        </div>
      </Heading>
      {add ? (
        <section className="card mb-6 p-6">
          <h2 className="mb-5">{tr("إضافة عميل")}</h2>
          <DataForm
            command="client_save"
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
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="relative w-full max-w-sm">
            <Search size={16} className="absolute start-3 top-3.5 text-muted" />
            <input
              className="field ps-10"
              placeholder={tr("ابحث بالاسم أو الإيميل أو الجوال…")}
              aria-label={tr("البحث عن عميل")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              ["", tr("الكل")],
              ["program", tr("بدون برنامج")],
              ["renew", tr("تجديد قريب")],
              ["balance", tr("دفعات متبقية")],
            ].map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? "btn-soft" : "btn-secondary"}
                onClick={() => setFilter(value)}
              >
                {tr(label)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 px-5 pb-4 sm:grid-cols-2">
          <label>
            {tr("حالة ومتابعة")}
            <select
              aria-label={tr("تصفية حالة العملاء")}
              className="field"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              {[
                ["", tr("كل العملاء")],
                ["active", tr("نشط")],
                ["inactive", tr("غير نشط")],
                ["new", tr("جديد")],
                ["checkin", tr("مراجعات متأخرة أو معلقة")],
                ["adherence", tr("التزام منخفض")],
                ["stalled", tr("تقدم مستقر يحتاج مراجعة")],
                ["archived", tr("المؤرشفون")],
                ["program", tr("بدون برنامج")],
                ["renew", tr("تجديد قريب")],
                ["balance", tr("دفعات متبقية")],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {tr(label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("ترتيب العملاء")}
            <select
              aria-label={tr("ترتيب العملاء")}
              className="field"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="newest">{tr("الأحدث أولًا")}</option>
              <option value="oldest">{tr("الأقدم أولًا")}</option>
              <option value="name">{tr("الاسم")}</option>
            </select>
          </label>
        </div>
        <ClientTable clients={clients} data={data} />
      </div>
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

  const [tab, setTab] = useState(
    ["program", "finance", "profile", "progress", "tracking"].includes(
      initialTab,
    )
      ? initialTab
      : "program",
  );
  const [templateId, setTemplateId] = useState("");
  const [loaded, setLoaded] = useState<Template | null>(null);
  const draft = data.programs.find(
    (p) => p.client_id === client.id && !p.published_at,
  );
  const published = data.programs.find(
    (p) => p.client_id === client.id && p.published_at,
  );
  const selected = loaded ?? draft ?? published;
  const subs = data.subscriptions.filter((s) => s.client_id === client.id);
  const whatsapp = client.phone.replace(/^0/, "966").replace(/\D/g, "");
  const programUrl = `${appUrl}/me?client=${client.id}`;
  return (
    <>
      <Link
        className="mb-5 inline-flex items-center gap-1 text-xs text-muted"
        href="/coach/clients"
      >
        {tr("العملاء")}
        <ChevronLeft size={12} />
        {tr("ملف العميل")}
      </Link>
      <Heading
        title={client.name}
        text={`${client.email}${client.phone ? " · " + client.phone : ""}`}
      >
        <div className="flex flex-wrap gap-2">
          <span
            className={`badge ${client.trainee_user_id ? "bg-accent/40 text-teal" : ""}`}
          >
            {client.trainee_user_id
              ? tr("حسابه مرتبط")
              : tr("بانتظار ربط الحساب")}
          </span>
          <button
            className="btn-secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(programUrl)
                .catch(() => window.prompt("انسخ رابط البرنامج", programUrl))
            }
          >
            <Copy size={14} />
            {tr("رابط البرنامج")}
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
        </div>
      </Heading>
      <PortalControl
        clientId={client.id}
        link={data.portal_links?.find(
          (l) => l.client_id === client.id && !l.revoked_at,
        )}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          ["program", tr("البرنامج والتغذية")],
          ["finance", tr("الباقات والدفعات")],
          ["profile", tr("البيانات والدعوة")],
          ["progress", tr("الهدف والوزن")],
          ["tracking", tr("السجلات والمراجعات")],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={tab === key ? "btn" : "btn-secondary"}
          >
            {tr(label)}
          </button>
        ))}
      </div>
      {tab === "tracking" ? (
        <ClientHub
          clientId={client.id}
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
                  : tr("ما فيه نسخة منشورة للعميل بعد.")}
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
                {data.templates.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                className="btn-secondary"
                disabled={!templateId}
                onClick={() => {
                  if (
                    draft &&
                    !window.confirm(
                      "سيستبدل محتوى المسودة بنسخة من القالب. النسخة المنشورة لن تتغير. تتابع؟",
                    )
                  )
                    return;
                  setLoaded(
                    structuredClone(
                      data.templates.find((t) => t.id === templateId)!,
                    ),
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
            initial={selected?.content ?? blankContent}
            name={selected?.name ?? "برنامج جديد"}
            id={draft?.id}
            clientId={client.id}
            library={data.exercises}
          />
        </section>
      ) : tab === "finance" ? (
        <div className="space-y-6">
          <details className="card p-6">
            <summary>{tr("إضافة باقة أو تجديد")}</summary>
            <div className="mt-5">
              <SubscriptionForm data={data} client={client} />
            </div>
          </details>
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
                "أضف الباقة وحدد بدايتها ونهايتها؛ تاريخ الدفع مستقل عنها.",
              )}
            />
          )}
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section className="card p-6">
            <h2 className="mb-5">{tr("بيانات العميل")}</h2>
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
            <h2>{tr("الوصول الآمن للمتدرب")}</h2>
            <p className="text-sm text-muted">
              {tr(
                "لا يكفي امتلاك الرابط. لقبول الدعوة، يلزم الدخول بإيميل العميل وتأكيد هويته.",
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

function SubscriptionForm({
  data,
  client,
}: {
  data: Snapshot;
  client: Client;
}) {
  const { t: tr } = useLocale();

  const all = data.subscriptions.filter((s) => s.client_id === client.id);
  const latest = [...all].sort((a, b) =>
    b.end_date.localeCompare(a.end_date),
  )[0];
  const [renew, setRenew] = useState(false);
  return (
    <div>
      <label className="mb-4 flex items-center gap-2 font-normal">
        <input
          type="checkbox"
          disabled={!latest}
          checked={renew}
          onChange={(e) => setRenew(e.target.checked)}
        />
        {tr("تجديد الباقة السابقة (يبدأ بعد انتهائها)")}
      </label>
      <DataForm
        key={String(renew)}
        command="subscription_create"
        base={{
          client_id: client.id,
          ...(renew && latest ? { previous_id: latest.id } : {}),
        }}
        fields={[
          {
            name: "name",
            label: "اسم الباقة",
            required: true,
            value: renew ? latest?.name : tr("تدريب شامل"),
          },
          {
            name: "price",
            label: "قيمة الباقة (ريال)",
            type: "number",
            required: true,
            value: renew ? latest?.price : 650,
          },
          {
            name: "start_date",
            label: "بداية الاشتراك",
            type: "date",
            required: true,
            value:
              renew && latest ? addDays(latest.end_date, 1) : riyadhToday(),
          },
          {
            name: "end_date",
            label: "نهاية الاشتراك",
            type: "date",
            required: true,
            value: addDays(
              renew && latest ? latest.end_date : riyadhToday(),
              30,
            ),
          },
        ]}
        label={renew ? tr("تأكيد التجديد") : tr("إضافة الباقة")}
      />
      <p className="mt-3 text-xs text-muted">
        {tr("إنشاء باقة لا يسجّل دفعة. سجّل الدفع بتاريخه الفعلي بشكل مستقل.")}
      </p>
    </div>
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

  const due = remaining(data, sub);
  const frozen = data.freezes.filter((f) => f.subscription_id === sub.id);
  const payments = data.payments.filter((p) => p.subscription_id === sub.id);
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
        </div>
        <span className="badge bg-accent/30 text-teal">
          {subscriptionState(data, sub)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 p-6">
        {[
          [tr("قيمة الباقة"), sub.price],
          [tr("المدفوع"), paid(data, sub.id)],
          [tr("المتبقي"), due],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <p className="text-xs text-muted">{tr(label)}</p>
            <p className="mt-1 text-lg font-semibold">{money(value, locale)}</p>
          </div>
        ))}
      </div>
      <div className="space-y-5 border-t p-6">
        {due > 0 ? (
          <details>
            <summary className="text-sm text-teal">
              {tr("تسجيل دفعة جزئية أو كاملة")}
            </summary>
            <div className="mt-4">
              <DataForm
                command="payment_add"
                idempotent
                base={{ subscription_id: sub.id }}
                fields={[
                  {
                    name: "amount",
                    label: "المبلغ (ريال)",
                    type: "number",
                    value: due,
                    required: true,
                  },
                  {
                    name: "method",
                    label: "طريقة الدفع",
                    type: "select",
                    options: methods,
                  },
                  {
                    name: "paid_date",
                    label: "تاريخ الدفع الفعلي",
                    type: "date",
                    value: riyadhToday(),
                    required: true,
                  },
                  {
                    name: "reference",
                    label: "مرجع العملية",
                    hint: "مرجع فريد يساعد في منع تكرار التحويل.",
                  },
                ]}
                label={tr("إثبات الدفعة في السجل")}
              />
            </div>
          </details>
        ) : null}
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
              {f.days} {tr("يومًا")}
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
      {payments.length ? <PaymentList data={data} payments={payments} /> : null}
    </section>
  );
}
function PaymentList({
  data,
  payments,
}: {
  data: Snapshot;
  payments: Snapshot["payments"];
}) {
  const { t: tr, language: locale } = useLocale();

  return (
    <div className="overflow-x-auto border-t">
      <table>
        <thead>
          <tr>
            <th>{tr("التاريخ")}</th>
            <th>{tr("المبلغ")}</th>
            <th>{tr("الطريقة / المرجع")}</th>
            <th>{tr("التوثيق")}</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const reversed = data.payments.some((r) => r.reverses === p.id);
            return (
              <tr key={p.id}>
                <td className="whitespace-nowrap">
                  {formatDate(p.paid_date, locale)}
                </td>
                <td
                  className={
                    p.kind === "reversal" ? "text-red-700" : "font-medium"
                  }
                >
                  {money(p.amount, locale)}
                </td>
                <td>
                  <p className="text-xs">
                    {tr(methods.find((m) => m.value === p.method)?.label)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {p.reference || tr("بدون مرجع")}
                  </p>
                </td>
                <td>
                  {p.kind === "reversal" ? (
                    <p className="max-w-xs text-xs text-muted">
                      {tr("عكس موثّق:")} {p.reason}
                    </p>
                  ) : reversed ? (
                    <span className="badge">{tr("عُكست بتصحيح")}</span>
                  ) : (
                    <details className="min-w-44">
                      <summary className="text-xs text-muted">
                        {tr("تصحيح الدفعة")}
                      </summary>
                      <div className="mt-3 min-w-60">
                        <DataForm
                          command="payment_reverse"
                          idempotent
                          base={{ payment_id: p.id }}
                          fields={[
                            {
                              name: "reason",
                              label: "سبب التصحيح (موثق)",
                              type: "textarea",
                              required: true,
                            },
                          ]}
                          label={tr("عكس الدفعة مع حفظ الأصل")}
                        />
                        <p className="mt-3 text-xs text-muted">
                          {tr(
                            "بعد العكس، سجّل المبلغ الصحيح كدفعة جديدة بمرجع مختلف. الأصل يبقى في السجل.",
                          )}
                        </p>
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Library({ data }: { data: Snapshot }) {
  const { t: tr, language: locale } = useLocale();

  const [tab, setTab] = useState("catalog");
  const [template, setTemplate] = useState<Template | null>(null);
  const [editor, setEditor] = useState(false);
  const [exerciseId, setExerciseId] = useState("");
  const [templateSeed, setTemplateSeed] = useState(blankContent);
  const [templateSeedName, setTemplateSeedName] = useState("قالب جديد");
  const [templateRevision, setTemplateRevision] = useState(0);
  const ex = data.exercises.find((e) => e.id === exerciseId);
  return (
    <>
      <Heading title={tr("مكتبة التدريب")} text="">
        <button
          className="btn"
          onClick={() => {
            setTemplate(null);
            setTemplateSeed(structuredClone(blankContent));
            setTemplateSeedName("قالب جديد");
            setTemplateRevision((value) => value + 1);
            setEditor(true);
            setTab("templates");
          }}
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
            setTab("catalog");
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
            setTab("templates");
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
          onClick={() => setTab("exercises")}
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
          selectionLabel={tr("برنامج جديد")}
          onSelect={(exercise) => {
            const seed = structuredClone(blankContent);
            seed.days[0].exercises = [
              {
                name: exerciseName(exercise),
                catalogId: exercise.id,
                description: "",
                video: "",
                sets: 3,
                reps: "10–12",
                rest: 90,
              },
            ];
            setTemplate(null);
            setTemplateSeed(seed);
            setTemplateRevision((value) => value + 1);
            setTemplateSeedName(
              ("برنامج " + exerciseName(exercise)).slice(0, 140),
            );
            setEditor(true);
            setTab("templates");
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
        {editor ? (
          <section className="card p-6">
            <button
              className="mb-5 text-xs text-muted"
              onClick={() => setEditor(false)}
            >
              {tr("رجوع للقوالب")}
            </button>
            <ProgramEditor
              key={(template?.id ?? "new") + ":" + templateRevision}
              initial={template?.content ?? templateSeed}
              name={template?.name ?? templateSeedName}
              id={template?.id.startsWith("copy:") ? undefined : template?.id}
              library={data.exercises}
            />
          </section>
        ) : data.templates.length ? (
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {data.templates
              .filter(
                (t) =>
                  !data.management?.template_metadata.some(
                    (m) => m.template_id === t.id && m.archived,
                  ),
              )
              .map((t) => (
                <article key={t.id} className="card p-6">
                  <span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-accent/30 text-teal">
                    <ClipboardList size={23} />
                  </span>
                  <h2>{t.name}</h2>
                  <p className="mt-2 text-sm text-muted">
                    {t.content.days.length} {tr("أيام ·")}{" "}
                    {t.content.days.reduce(
                      (sum, d) => sum + d.exercises.length,
                      0,
                    )}{" "}
                    {tr("تمارين")}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {tr("آخر تعديل")} {formatDate(t.updated_at, locale)}
                  </p>
                  <div className="mt-6 flex gap-2">
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setTemplate(t);
                        setEditor(true);
                      }}
                    >
                      {tr("فتح وتعديل")}
                    </button>
                    <button
                      className="btn-soft"
                      onClick={() => {
                        setTemplate({
                          ...structuredClone(t),
                          id: "copy:" + t.id,
                          name: t.name + " · نسخة",
                        });
                        setEditor(true);
                      }}
                    >
                      <Copy size={14} />
                      {tr("نسخ")}
                    </button>
                  </div>
                </article>
              ))}
          </div>
        ) : (
          <Empty
            title={tr("مكتبتك تبدأ من أول قالب")}
            text={tr(
              "أنشئ قالبًا ثم انسخ محتواه لكل عميل. التعديل على النسخة لا يغيّر القالب.",
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
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]">
          <section className="card divide-y divide-line">
            {data.exercises.length ? (
              data.exercises.map((e) => (
                <article key={e.id} className="flex items-start gap-3 p-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
                    <Dumbbell size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium">{e.name}</h3>
                    <p className="mt-1 text-xs leading-7 text-muted">
                      {e.description || tr("بدون شرح إضافي")}
                    </p>
                    {e.video ? (
                      <a
                        className="mt-2 inline-block text-xs text-teal underline"
                        href={e.video}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {tr("رابط الفيديو")}
                      </a>
                    ) : null}
                  </div>
                  <button
                    className="text-xs text-teal"
                    onClick={() => setExerciseId(e.id)}
                  >
                    {tr("تعديل")}
                  </button>
                </article>
              ))
            ) : (
              <div className="empty">{tr("أضف أول تمرين لمكتبتك.")}</div>
            )}
          </section>
          <section className="card p-6">
            <div className="section-title">
              <h2>{ex ? tr("تعديل التمرين") : tr("تمرين جديد")}</h2>
              {ex ? (
                <button
                  className="text-xs text-teal"
                  onClick={() => setExerciseId("")}
                >
                  {tr("إضافة جديد")}
                </button>
              ) : null}
            </div>
            <DataForm
              key={ex?.id ?? "new"}
              command="exercise_save"
              base={ex ? { id: ex.id } : {}}
              fields={[
                {
                  name: "name",
                  label: "اسم التمرين",
                  value: ex?.name,
                  required: true,
                },
                {
                  name: "video",
                  label: "فيديو اختياري",
                  type: "url",
                  value: ex?.video,
                  hint: "رابط https فقط، بدون رفع ملفات",
                },
                {
                  name: "description",
                  label: "شرح الحركة",
                  type: "textarea",
                  value: ex?.description,
                },
              ]}
            />
          </section>
        </div>
      </div>
    </>
  );
}
function Finance({ data }: { data: Snapshot }) {
  const { t: tr, language: locale } = useLocale();

  const total = data.subscriptions.reduce((n, s) => n + Number(s.price), 0);
  const received = data.payments.reduce((n, p) => n + Number(p.amount), 0);
  return (
    <>
      <Heading
        title={tr("الباقات والدفعات")}
        text={tr("تاريخ الاشتراك مستقل عن الدفع. كل حركة لها أثر واضح.")}
      >
        <a download href="/api/export" className="btn-secondary">
          <Download size={16} />
          {tr("تصدير السجل")}
        </a>
      </Heading>
      <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        {tr(
          "هذا سجل متابعة دفعات داخلي يديره المدرب، وليس فاتورة ضريبية أو إيصالًا من بوابة دفع.",
        )}
      </p>
      <div className="mb-7 grid gap-4 sm:grid-cols-3">
        {[
          [tr("قيمة الباقات"), total],
          [tr("صافي الدفعات"), received],
          [tr("المتبقي"), total - received],
        ].map(([label, value]) => (
          <div key={String(label)} className="card p-6">
            <p className="text-xs text-muted">{tr(label)}</p>
            <p className="mt-3 text-2xl font-semibold">
              {money(value, locale)}
            </p>
          </div>
        ))}
      </div>
      <section className="card overflow-hidden">
        <div className="section-title px-6 pt-6">
          <h2>{tr("الاشتراكات")}</h2>
          <Link className="btn-soft" href="/coach/clients">
            {tr("إضافة باقة من ملف العميل")}
            <Plus size={14} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>{tr("العميل")}</th>
                <th>{tr("الباقة")}</th>
                <th>{tr("البداية")}</th>
                <th>{tr("النهاية")}</th>
                <th>{tr("المتبقي")}</th>
              </tr>
            </thead>
            <tbody>
              {data.subscriptions.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      className="text-teal"
                      href={`/coach/clients/${s.client_id}`}
                    >
                      {data.clients.find((c) => c.id === s.client_id)?.name ??
                        tr("عميل محذوف")}
                    </Link>
                  </td>
                  <td>{s.name}</td>
                  <td>{formatDate(s.start_date, locale)}</td>
                  <td>{formatDate(s.end_date, locale)}</td>
                  <td>{money(remaining(data, s), locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.subscriptions.length ? (
            <div className="empty">{tr("ما فيه باقات بعد.")}</div>
          ) : null}
        </div>
      </section>
      <section className="card mt-7 overflow-hidden">
        <h2 className="p-6">{tr("سجل الدفعات والتصحيحات")}</h2>
        {data.payments.length ? (
          <PaymentList data={data} payments={data.payments} />
        ) : (
          <div className="empty">
            {tr("أضف دفعة من ملف العميل بعد إنشاء الباقة.")}
          </div>
        )}
      </section>
    </>
  );
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
            "الموافقة تضيف العميل فقط. أنشئ دعوته من ملفه لربط الحساب بعد التحقق.",
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
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-3">{tr("رابط طلب الانضمام")}</h2>
          <p className="mb-5 text-sm leading-7 text-muted">
            {tr(
              "يقدم العميل طلبًا، وتراجعه أنت. لا يُنشأ ارتباط حساب قبل الدعوة والتحقق من الإيميل.",
            )}
          </p>
          <LinkBox kind="join" />
        </section>
        <section className="card p-6">
          <h2>{tr("تصدير البيانات")}</h2>
          <p className="mt-3 mb-5 text-sm text-muted">
            {tr("تصدير خاص بعملائك فقط. احتفظ بالملفات في مكان آمن.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <a download href="/api/export" className="btn-secondary">
              <Download size={16} />
              {tr("كل بياناتك (JSON)")}
            </a>
            <a download href="/api/export?type=clients" className="btn-soft">
              {tr("العملاء (CSV)")}
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
                      {tr("عدّل البيانات في ملف العميل أولًا")}
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
                <th>{tr("مرجع السجل")}</th>
              </tr>
            </thead>
            <tbody>
              {data.audit.map((a) => (
                <tr key={a.id}>
                  <td className="text-xs">
                    {formatDate(a.created_at, locale)}
                  </td>
                  <td className="text-xs" dir="ltr">
                    {a.action}
                  </td>
                  <td className="font-mono text-xs text-muted">
                    {a.entity_id?.slice(0, 12)}
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
