"use client";
import { useLocale } from "./locale-provider";
import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Users,
  Dumbbell,
  CalendarDays,
  ArrowLeft,
  Check,
  Search,
  Flame,
  ChevronLeft,
} from "lucide-react";
import type { Snapshot, Client } from "@/lib/model";
import { coachingAlerts } from "@/lib/coaching-alerts";
import {
  riyadhToday,
  addDays,
  daysBetween,
  money,
  formatDate,
} from "@/lib/dates";
export function CoachToday({ data }: { data: Snapshot }) {
  const { t: tr, language: locale } = useLocale();

  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const today = riyadhToday(),
    clients = data.clients.filter((c) => !c.archived);
  const latest = (id: string) =>
    data.programs.find((p) => p.client_id === id && p.published_at);
  const debt = (id: string) =>
    data.subscriptions
      .filter((s) => s.client_id === id)
      .reduce(
        (sum, s) =>
          sum +
          Math.max(
            0,
            Number(s.price) -
              data.payments
                .filter((p) => p.subscription_id === s.id)
                .reduce((n, p) => n + Number(p.amount), 0),
          ),
        0,
      );
  const current = (id: string) => {
    const all = data.subscriptions.filter((s) => s.client_id === id);
    return (
      all.find((s) => s.start_date <= today && s.end_date >= today) ??
      all
        .filter((s) => s.start_date > today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ??
      all.sort((a, b) => b.end_date.localeCompare(a.end_date))[0]
    );
  };
  const active = clients.filter((c) => {
    const s = current(c.id);
    return (
      s &&
      s.start_date <= today &&
      s.end_date >= today &&
      !data.freezes.some(
        (f) =>
          f.subscription_id === s.id &&
          f.start_date <= today &&
          f.end_date >= today,
      )
    );
  });
  const renew = clients.filter((c) => {
    const s = current(c.id);
    return (
      s &&
      s.end_date <= addDays(today, 7) &&
      !data.subscriptions.some(
        (next) => next.client_id === c.id && next.start_date > s.end_date,
      )
    );
  });
  const needs = clients.filter((c) => !latest(c.id));
  const stale = clients.filter((c) => {
    const p = latest(c.id);
    return (
      p && daysBetween(riyadhToday(new Date(p.published_at!)), today) >= 28
    );
  });
  const drafts = data.programs.filter((p) => !p.published_at);
  const totalDebt = clients.reduce((n, c) => n + debt(c.id), 0);
  const thisMonth = today.slice(0, 7);
  const revenue = data.payments
    .filter((p) => p.paid_date.startsWith(thisMonth))
    .reduce((n, p) => n + Number(p.amount), 0);
  const prevMonth = addDays(thisMonth + "-01", -1).slice(0, 7);
  const previousRevenue = data.payments
    .filter((p) => p.paid_date.startsWith(prevMonth))
    .reduce((n, p) => n + Number(p.amount), 0);
  const noWeight = clients.filter((c) => {
    const ws = (data.weights ?? [])
      .filter((w) => w.client_id === c.id)
      .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    return (
      data.client_goals?.some((g) => g.client_id === c.id && g.target_weight) &&
      (!ws[0] || daysBetween(ws[0].entry_date, today) > 7)
    );
  });
  const taskMap = new Map<
    string,
    { client: Client; items: string[]; urgent: boolean }
  >();
  function task(c: Client, label: string, urgent = false) {
    if (
      data.management?.details.some(
        (detail) => detail.client_id === c.id && detail.status === "inactive",
      )
    )
      return;
    const existing = taskMap.get(c.id) ?? {
      client: c,
      items: [],
      urgent: false,
    };
    existing.items.push(label);
    existing.urgent ||= urgent;
    taskMap.set(c.id, existing);
  }
  for (const alert of coachingAlerts(data).filter(
    (alert) => alert.kind !== "new" && alert.kind !== "renewal",
  )) {
    const client = clients.find((client) => client.id === alert.clientId);
    if (client) task(client, alert.label, alert.urgent);
  }
  needs.forEach((c) => task(c, "برنامج أول"));
  renew.forEach((c) => task(c, "تجديد", current(c.id)!.end_date < today));
  stale.forEach((c) => task(c, "مراجعة برنامج"));
  noWeight.forEach((c) => task(c, "متابعة وزن"));
  clients.filter((c) => debt(c.id) > 0).forEach((c) => task(c, "دفعة متبقية"));
  const tasks = [...taskMap.values()].sort(
    (a, b) => Number(b.urgent) - Number(a.urgent),
  );
  const visible = clients.filter(
    (c) =>
      (!query ||
        [c.name, c.email, c.phone]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "all" ||
        (filter === "needs" && needs.includes(c)) ||
        (filter === "renew" && renew.includes(c)) ||
        (filter === "debt" && debt(c.id) > 0) ||
        (filter === "draft" && drafts.some((p) => p.client_id === c.id))),
  );
  const ready = clients.length
    ? Math.round(((clients.length - needs.length) / clients.length) * 100)
    : 0;
  return (
    <div className="coach-home">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">{tr("لوحة التحكم")}</p>
          <h1>{tr("نظرة عامة")}</h1>
          <p className="mt-2 text-sm text-muted">
            {tr(
              "أهلًا {0}، هذه آخر مستجدات متدربيك وأعمالك.",
              data.profile!.name.split(" ")[0],
            )}
          </p>
        </div>
        <div className="dashboard-actions">
          <Link className="btn-secondary" href="/coach/library">
            <Dumbbell size={17} />
            {tr("مكتبة التدريب")}
          </Link>
          <Link className="btn" href="/coach/clients?add=1">
            <Plus size={17} />
            {tr("متدرب جديد")}
          </Link>
        </div>
      </div>
      <div className="stat-strip" aria-label={tr("ملخص المتدربين")}>
        {[
          {
            label: "قائمة المتدربين",
            value: clients.length,
            icon: Users,
            key: "all",
          },
          {
            label: "بانتظار برنامج",
            value: needs.length,
            icon: Dumbbell,
            key: "needs",
          },
          {
            label: "تجديد خلال 7 أيام",
            value: renew.length,
            icon: CalendarDays,
            key: "renew",
          },
          {
            label: "مسودات جاهزة للعمل",
            value: drafts.length,
            icon: Flame,
            key: "draft",
          },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            aria-pressed={filter === s.key}
            className={filter === s.key ? "strip-active" : ""}
          >
            <s.icon size={19} />
            <span>{tr(s.label)}</span>
            <strong>{String(s.value).padStart(2, "0")}</strong>
          </button>
        ))}
      </div>
      <div className="command-deck">
        <section className="performance-hero">
          <div className="readiness-summary">
            <div>
              <h2>{tr("جاهزية البرامج")}</h2>
              <p>
                {needs.length
                  ? tr("{0} متدرب بانتظار برنامج", String(needs.length))
                  : tr("كل البرامج جاهزة للمتابعة")}
              </p>
            </div>
            <strong>
              {ready}
              <small>{tr("٪")}</small>
            </strong>
          </div>
          <progress
            aria-label={tr("جاهزية برامج المتدربين")}
            value={ready}
            max={100}
          />
          <div className="readiness-footer">
            <span>
              {active.length} {tr("اشتراك نشط ·")} {data.templates.length}{" "}
              {tr("قوالب")}
            </span>
            <Link
              href={
                needs.length
                  ? "/coach/clients?filter=program"
                  : "/coach/clients"
              }
            >
              {tr("إدارة البرامج")}
              <ArrowLeft size={16} />
            </Link>
          </div>
        </section>
        <section className="revenue-card">
          <div>
            <span className="summary-label">{tr("المحصّل هذا الشهر")}</span>
            <strong className="revenue-number">{money(revenue, locale)}</strong>
            <p>
              {tr("الشهر السابق")} {money(previousRevenue, locale)}
            </p>
          </div>
          <div className="revenue-secondary">
            <span>
              {tr("المبالغ المتبقية")}
              <strong>{money(totalDebt, locale)}</strong>
            </span>
            <Link href="/coach/finance" className="finance-link">
              {tr("سجل الدفعات")}
              <ArrowLeft size={16} />
            </Link>
          </div>
        </section>
      </div>
      <div className="mt-6 grid items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{tr("تحتاج اهتمامك")}</p>
              <h2>{tr("متابعات اليوم")}</h2>
            </div>
            <span className="badge">
              {tasks.length} {tr("متدرب")}
            </span>
          </div>
          {!tasks.length ? (
            <div className="empty">
              <Check />
              <p>{tr("ما عندك متابعات معلّقة.")}</p>
              <Link href="/coach/library" className="btn-secondary">
                {tr("جهّز قالبك القادم")}
              </Link>
            </div>
          ) : (
            <div>
              {tasks.slice(0, 5).map(({ client: c, items, urgent }, i) => (
                <Link
                  href={"/coach/clients/" + c.id + "?tab=tracking"}
                  key={c.id}
                  className="task-row"
                >
                  <span className="task-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="text-sm">{c.name}</strong>
                    <p className="mt-1 text-xs text-muted">
                      {items.map((item) => tr(item)).join(" / ")}
                    </p>
                  </div>
                  {urgent ? (
                    <span className="badge bg-red-50 text-red-700">
                      {tr("عاجل")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">
                      {debt(c.id) > 0
                        ? money(debt(c.id), locale)
                        : latest(c.id)
                          ? tr("متابعة")
                          : tr("جهّز الجدول")}
                    </span>
                  )}
                  <ChevronLeft size={16} />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="card p-5">
          <h2>{tr("آخر نشاط مسجل")}</h2>
          <p className="text-sm text-muted mt-1">
            {tr("تحديثات فعلية من سجلات المتدربين")}
          </p>
          <div className="mt-4">
            {(data.management?.records ?? [])
              .slice()
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 6)
              .map((record) => (
                <Link
                  key={record.id}
                  className="block border-b py-3"
                  href={"/coach/clients/" + record.client_id + "?tab=tracking"}
                >
                  <strong className="text-sm">
                    {clients.find((client) => client.id === record.client_id)
                      ?.name ?? tr("متدرب")}
                  </strong>
                  <p className="text-xs text-muted">
                    {tr(
                      {
                        checkin: "مراجعة أسبوعية",
                        measurement: "قياس جديد",
                        nutrition_log: "تغذية فعلية",
                        workout_log: "حصة تدريبية",
                        message: "رسالة",
                        note: "ملاحظة",
                        nutrition_target: "هدف تغذية",
                        program_history: "برنامج تاريخي",
                        goal_history: "هدف تاريخي",
                      }[record.kind],
                    )}{" "}
                    · {record.entry_date}
                  </p>
                </Link>
              ))}
            {!data.management?.records.length && (
              <p className="text-sm text-muted py-6">
                {tr("سيظهر هنا نشاط العملاء بعد تسجيله.")}
              </p>
            )}
          </div>
        </section>
      </div>
      <section className="card mt-6 overflow-hidden">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{tr("متدربوك")}</p>
            <h2>{tr("قائمة المتدربين")}</h2>
          </div>
          <div className="relative">
            <Search size={16} className="absolute end-3 top-3 text-muted" />
            <input
              aria-label={tr("بحث سريع عن متدرب")}
              className="field pe-9"
              placeholder={tr("اسم، جوال، إيميل…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="roster-tabs">
          {[
            ["all", tr("الكل")],
            ["needs", tr("بدون برنامج")],
            ["renew", tr("التجديدات")],
            ["debt", tr("مبالغ متبقية")],
            ["draft", tr("لديهم مسودة")],
          ].map(([k, v]) => (
            <button
              key={k}
              aria-pressed={filter === k}
              className={filter === k ? "selected" : ""}
              onClick={() => setFilter(k)}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="roster-table overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>{tr("المتدرب / الهدف")}</th>
                <th>{tr("البرنامج")}</th>
                <th>{tr("التغذية")}</th>
                <th>{tr("آخر وزن")}</th>
                <th>{tr("الاشتراك")}</th>
                <th>{tr("المتبقي")}</th>
                <th aria-label={tr("افتح ملف المتدرب")} />
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, 8).map((c) => {
                const p = latest(c.id),
                  s = current(c.id),
                  g = data.client_goals?.find((g) => g.client_id === c.id),
                  w = (data.weights ?? [])
                    .filter((w) => w.client_id === c.id)
                    .sort((a, b) =>
                      b.entry_date.localeCompare(a.entry_date),
                    )[0];
                return (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={"/coach/clients/" + c.id}
                        className="flex items-center gap-3"
                      >
                        <span className="roster-avatar">{c.name[0]}</span>
                        <div>
                          <strong className="whitespace-nowrap">
                            {c.name}
                          </strong>
                          <p className="text-xs text-muted">
                            {g?.goal || tr("لم يُحدد الهدف")}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td>
                      {p ? (
                        <>
                          <strong className="text-xs">
                            {p.content.days.length} {tr("أيام /")} {p.name}
                          </strong>
                          <p className="text-xs text-muted">
                            {formatDate(p.published_at!, locale)}
                          </p>
                        </>
                      ) : (
                        <span className="status-dot">
                          {tr("بانتظار التجهيز")}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {p?.content.nutrition.calories
                        ? tr("{0} سعرة", String(p.content.nutrition.calories))
                        : "—"}
                      {p?.content.nutrition.meals?.length ? (
                        <p className="text-xs text-muted">
                          {p.content.nutrition.meals.length} {tr("وجبات")}
                        </p>
                      ) : null}
                    </td>
                    <td>
                      {w ? (
                        <>
                          <strong dir="ltr">
                            {w.weight} {tr("كجم")}
                          </strong>
                          <p className="text-xs text-muted">
                            {formatDate(w.entry_date, locale)}
                          </p>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <span className="text-xs">
                        {s ? formatDate(s.end_date, locale) : tr("بدون باقة")}
                      </span>
                    </td>
                    <td
                      className={
                        debt(c.id) ? "font-bold text-teal" : "text-muted"
                      }
                    >
                      {money(debt(c.id), locale)}
                    </td>
                    <td>
                      <Link
                        className="btn-secondary !px-2"
                        aria-label={tr("افتح ") + c.name}
                        href={"/coach/clients/" + c.id}
                      >
                        <ChevronLeft size={15} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length ? (
            <div className="empty">
              <p>{tr("ما فيه متدربين يطابقون هذا الفلتر.")}</p>
            </div>
          ) : null}
        </div>
        <div className="mobile-roster">
          {visible.slice(0, 8).map((c) => {
            const p = latest(c.id),
              g = data.client_goals?.find((g) => g.client_id === c.id);
            const weight = (data.weights ?? [])
              .filter((w) => w.client_id === c.id)
              .sort((a, b) => b.entry_date.localeCompare(a.entry_date))[0];
            return (
              <Link
                href={"/coach/clients/" + c.id}
                key={c.id}
                className="mobile-athlete"
              >
                <div className="mobile-athlete-heading">
                  <span className="roster-avatar">{c.name[0]}</span>
                  <div className="min-w-0 flex-1">
                    <strong>{c.name}</strong>
                    <p>{g?.goal || tr("لم يُحدد الهدف")}</p>
                  </div>
                  <ChevronLeft size={16} />
                </div>
                <div className="mobile-athlete-details">
                  <span>
                    {tr("البرنامج")}
                    <strong>{p?.name || tr("بانتظار التجهيز")}</strong>
                  </span>
                  <span>
                    {tr("آخر وزن")}
                    <strong>
                      {weight ? weight.weight + tr(" كجم") : tr("لم يُسجل")}
                    </strong>
                  </span>
                  <span>
                    {tr("المتبقي")}
                    <strong>{money(debt(c.id), locale)}</strong>
                  </span>
                </div>
              </Link>
            );
          })}
          {!visible.length && (
            <div className="empty">
              <p>{tr("لا يوجد متدربون يطابقون البحث.")}</p>
            </div>
          )}
        </div>
        <Link
          className="flex items-center justify-center gap-2 border-t p-4 text-xs font-bold"
          href="/coach/clients"
        >
          {tr("إدارة جميع المتدربين")}
          <ArrowLeft size={14} />
        </Link>
      </section>
    </div>
  );
}
