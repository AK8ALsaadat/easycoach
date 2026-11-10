"use client";
import Link from "next/link";
import { ArrowUpLeft, ClipboardList, MessageCircle, CheckCircle2 } from "lucide-react";
import type { Client, Snapshot } from "@/lib/model";
import { coachingAlerts } from "@/lib/coaching-alerts";
import { useLocale } from "./locale-provider";
import { ManagementButton } from "./management-button";
import { SubscriptionRenewal } from "./subscription-renewal";
import { PhoneLink } from "./phone-link";

export function ClientBoard({ data, clients }: { data: Snapshot; clients: Client[] }) {
  const { t: tr } = useLocale();
  const alerts = coachingAlerts(data);
  const published = new Set(data.programs.filter(p => p.published_at).map(p => p.client_id));
  const inactive = new Set(data.management?.details.filter(d => d.status === "inactive").map(d => d.client_id));
  const attention = new Map<string, string[]>();
  for (const alert of alerts.filter(a => a.kind !== "new")) {
    attention.set(alert.clientId, [...new Set([...(attention.get(alert.clientId) ?? []), alert.label])]);
  }
  const columns = [
    { id: "program", title: "يحتاج برنامجًا", icon: ClipboardList, hint: "جهّز البرنامج ثم انشره للمتدرب.", tab: "program", action: "تجهيز البرنامج" },
    { id: "followup", title: "يحتاج متابعة", icon: MessageCircle, hint: "مراجعات ورسائل وتجديدات تحتاج انتباهك.", tab: "tracking", action: "فتح المتابعة" },
    { id: "ready", title: "على المسار", icon: CheckCircle2, hint: "برنامج منشور ولا توجد تنبيهات متابعة حاليًا.", tab: "program", action: "عرض البرنامج" },
    { id: "inactive", title: "غير نشط", icon: ClipboardList, hint: "متدربون غير نشطين أو مؤرشفون.", tab: "profile", action: "فتح الملف" },
  ];
  const columnFor = (client: Client) => client.archived || inactive.has(client.id) ? "inactive" : !published.has(client.id) ? "program" : attention.has(client.id) ? "followup" : "ready";
  return <div className="client-board" role="region" aria-label={tr("لوحة متابعة المتدربين")}>
    {columns.map(column => {
      const members = clients.filter(client => columnFor(client) === column.id);
      const Icon = column.icon;
      return <section className={`client-board-column client-board-${column.id}`} key={column.id} aria-label={tr(column.title)}>
        <header><h2><Icon size={17} aria-hidden="true" />{tr(column.title)}</h2><span className="badge">{members.length}</span></header>
        <p className="client-board-hint">{tr(column.hint)}</p>
        <div className="client-board-cards">{members.map(client => <article className="client-board-card" key={client.id}>
          {client.archived ? <p className="client-board-name">{client.name}</p> : <Link className="client-board-name" href={`/coach/clients/${client.id}`}><span className="client-board-avatar" aria-hidden="true">{client.name.trim().slice(0, 1)}</span><span>{client.name}</span></Link>}
          <p className="client-board-email" dir="auto">{client.email}</p>
          <PhoneLink phone={client.phone}/>
          {column.id !== "inactive" && attention.get(client.id)?.slice(0, 2).map(label => <p className="client-board-alert" key={label}>{tr(label)}</p>)}
          {client.archived ? <ManagementButton command="client_archive" payload={{ client_id: client.id, archived: false }}>{tr("إعادة التفعيل")}</ManagementButton> : <Link className="btn-soft" href={`/coach/clients/${client.id}?tab=${column.tab}`}>{tr(column.action)}<ArrowUpLeft size={14} aria-hidden="true" /></Link>}
          {!client.archived && <SubscriptionRenewal client={client} subscriptions={data.subscriptions} />}
        </article>)}</div>
        {!members.length && <p className="client-board-empty">{tr("لا يوجد متدربون في هذا العمود")}</p>}
      </section>;
    })}
  </div>;
}
