"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpLeft,
  Plus,
  Users,
  Dumbbell,
  Wallet,
  CalendarDays,
  ArrowLeft,
  Check,
  Search,
  Scale,
  Flame,
  ChevronLeft,
} from "lucide-react";
import type { Snapshot, Client } from "@/lib/model";
import {
  riyadhToday,
  addDays,
  daysBetween,
  money,
  formatDate,
} from "@/lib/dates";
export function CoachToday({ data }: { data: Snapshot }) {
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
    const existing = taskMap.get(c.id) ?? {
      client: c,
      items: [],
      urgent: false,
    };
    existing.items.push(label);
    existing.urgent ||= urgent;
    taskMap.set(c.id, existing);
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
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, -6 + i);
    return {
      day,
      value: data.programs.filter(
        (p) => p.published_at && riyadhToday(new Date(p.published_at)) === day,
      ).length,
    };
  });
  const max = Math.max(1, ...week.map((d) => d.value));
  const ready = clients.length
    ? Math.round(((clients.length - needs.length) / clients.length) * 100)
    : 0;
  return (
    <div className="coach-home">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">
            COACH’S DESK /{" "}
            {new Intl.DateTimeFormat("en", {
              month: "short",
              year: "numeric",
              timeZone: "Asia/Riyadh",
            })
              .format(new Date())
              .toUpperCase()}
          </p>
          <h1>
            شغلك اليوم، <span>على المكشوف.</span>
          </h1>
          <p className="mt-2 text-sm text-muted">
            {data.profile!.name.split(" ")[0]}، عندك {tasks.length} متدرب يحتاج
            متابعة.
          </p>
        </div>
        <Link className="btn" href="/coach/clients?add=1">
          <Plus size={17} />
          متدرب جديد
        </Link>
      </div>
      <div className="command-deck">
        <section className="performance-hero">
          <div className="hero-index">01 / THE ROSTER</div>
          <div className="hero-copy">
            <p className="text-sm text-white/55">جاهزية برامج المتدربين</p>
            <div className="hero-number">
              {ready}
              <span>%</span>
            </div>
            <h2>
              {needs.length
                ? `${needs.length} متدرب ينتظر أول برنامج.`
                : clients.length
                  ? "كل متدرب عنده خطة."
                  : "أول متدرب، أول خطة."}
            </h2>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="hero-link" href="/coach/clients?filter=program">
                {needs.length ? "جهّز البرامج" : "افتح قائمة المتدربين"}
                <ArrowUpLeft size={18} />
              </Link>
              <Link href="/coach/library" className="hero-secondary">
                مكتبة الحركات / 876
              </Link>
            </div>
          </div>
          <div className="hero-plates" aria-hidden="true">
            <span />
            <span />
            <span />
            <i />
          </div>
          <div className="hero-bottom">
            <span>{active.length} اشتراك نشط</span>
            <span>{drafts.length} مسودات قيد التجهيز</span>
            <span>{data.templates.length} قوالب جاهزة</span>
          </div>
        </section>
        <section className="revenue-card">
          <div className="section-title">
            <span className="eyebrow">CASHFLOW / THIS MONTH</span>
            <Wallet size={20} />
          </div>
          <p className="text-sm text-white/60">المحصّل هذا الشهر</p>
          <strong className="revenue-number">{money(revenue)}</strong>
          <p className="text-xs text-white/45">
            الشهر السابق {money(previousRevenue)}
          </p>
          <div className="revenue-divider" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/55">مستحقات غير محصّلة</span>
            <strong>{money(totalDebt)}</strong>
          </div>
          <Link
            href="/coach/finance"
            className="mt-5 flex items-center justify-between text-sm font-bold text-accent"
          >
            افتح سجل الدفعات
            <ArrowLeft size={18} />
          </Link>
        </section>
      </div>
      <div className="stat-strip">
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
            className={filter === s.key ? "strip-active" : ""}
          >
            <s.icon size={19} />
            <span>{s.label}</span>
            <strong>{String(s.value).padStart(2, "0")}</strong>
          </button>
        ))}
      </div>
      <div className="mt-6 grid items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">NEXT ACTIONS</p>
              <h2>ابدأ بهذولا</h2>
            </div>
            <span className="badge">{tasks.length} متدرب</span>
          </div>
          {!tasks.length ? (
            <div className="empty">
              <Check />
              <p>ما عندك متابعات معلّقة.</p>
              <Link href="/coach/library" className="btn-secondary">
                جهّز قالبك القادم
              </Link>
            </div>
          ) : (
            <div>
              {tasks.slice(0, 6).map(({ client: c, items, urgent }, i) => (
                <Link
                  href={"/coach/clients/" + c.id}
                  key={c.id}
                  className="task-row"
                >
                  <span className="task-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="text-sm">{c.name}</strong>
                    <p className="mt-1 text-[11px] text-muted">
                      {items.join(" / ")}
                    </p>
                  </div>
                  {urgent ? (
                    <span className="badge bg-red-50 text-red-700">منتهي</span>
                  ) : (
                    <span className="text-[11px] text-muted">
                      {debt(c.id) > 0
                        ? money(debt(c.id))
                        : latest(c.id)
                          ? "متابعة"
                          : "جهّز الجدول"}
                    </span>
                  )}
                  <ChevronLeft size={16} />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="card p-5">
          <div className="section-title">
            <div>
              <p className="eyebrow">PROGRAM OUTPUT</p>
              <h2>شغل الأسبوع</h2>
            </div>
            <span className="metric-number">
              {week.reduce((n, d) => n + d.value, 0)}
            </span>
          </div>
          <div className="activity-bars">
            {week.map((d) => (
              <div key={d.day}>
                <span>{d.value || ""}</span>
                <div
                  style={{ height: Math.max(4, (d.value / max) * 95) }}
                  className={d.day === today ? "bar-today" : ""}
                />
                <small>
                  {new Intl.DateTimeFormat("ar-SA", {
                    weekday: "short",
                    timeZone: "Asia/Riyadh",
                  }).format(new Date(d.day + "T12:00:00Z"))}
                </small>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t pt-3 text-[11px] text-muted">
            برامج نشرتها خلال آخر 7 أيام
          </p>
          {noWeight.length ? (
            <Link
              href={"/coach/clients/" + noWeight[0].id}
              className="weight-alert"
            >
              <Scale size={19} />
              <span>{noWeight.length} متدرب عنده هدف وزن بدون تسجيل حديث</span>
              <ArrowLeft size={14} />
            </Link>
          ) : null}
        </section>
      </div>
      <section className="card mt-6 overflow-hidden">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">YOUR ATHLETES</p>
            <h2>القائمة تحت يدك</h2>
          </div>
          <div className="relative">
            <Search size={16} className="absolute end-3 top-3 text-muted" />
            <input
              aria-label="بحث سريع عن متدرب"
              className="field pe-9"
              placeholder="اسم، جوال، إيميل…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="roster-tabs">
          {[
            ["all", "الكل"],
            ["needs", "بدون برنامج"],
            ["renew", "التجديدات"],
            ["debt", "مبالغ متبقية"],
            ["draft", "لديهم مسودة"],
          ].map(([k, v]) => (
            <button
              key={k}
              className={filter === k ? "selected" : ""}
              onClick={() => setFilter(k)}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>المتدرب / الهدف</th>
                <th>البرنامج</th>
                <th>التغذية</th>
                <th>آخر وزن</th>
                <th>الاشتراك</th>
                <th>المتبقي</th>
                <th aria-label="افتح ملف المتدرب" />
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, 12).map((c) => {
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
                          <p className="text-[11px] text-muted">
                            {g?.goal || "لم يُحدد الهدف"}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td>
                      {p ? (
                        <>
                          <strong className="text-xs">
                            {p.content.days.length} أيام / {p.name}
                          </strong>
                          <p className="text-[11px] text-muted">
                            {formatDate(p.published_at!)}
                          </p>
                        </>
                      ) : (
                        <span className="status-dot">بانتظار التجهيز</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {p?.content.nutrition.calories
                        ? `${p.content.nutrition.calories} kcal`
                        : "—"}
                      {p?.content.nutrition.meals?.length ? (
                        <p className="text-[11px] text-muted">
                          {p.content.nutrition.meals.length} وجبات
                        </p>
                      ) : null}
                    </td>
                    <td>
                      {w ? (
                        <>
                          <strong dir="ltr">{w.weight} kg</strong>
                          <p className="text-[10px] text-muted">
                            {formatDate(w.entry_date)}
                          </p>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <span className="text-xs">
                        {s ? formatDate(s.end_date) : "بدون باقة"}
                      </span>
                    </td>
                    <td
                      className={
                        debt(c.id) ? "font-bold text-teal" : "text-muted"
                      }
                    >
                      {money(debt(c.id))}
                    </td>
                    <td>
                      <Link
                        className="btn-secondary !px-2"
                        aria-label={"افتح " + c.name}
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
              <p>ما فيه متدربين يطابقون هذا الفلتر.</p>
            </div>
          ) : null}
        </div>
        <Link
          className="flex items-center justify-center gap-2 border-t p-4 text-xs font-bold"
          href="/coach/clients"
        >
          إدارة جميع المتدربين
          <ArrowLeft size={14} />
        </Link>
      </section>
    </div>
  );
}
