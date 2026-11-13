import type { Snapshot } from "./model";
import { coachingAlerts } from "./coaching-alerts";
import { clientMatchesQuery, renewalDue } from "./client-workflow";
import { effectiveNutrition } from "./management";
import { daysBetween, riyadhToday } from "./dates";
import { latestSubscription } from "./subscription-period";

export function clientRoster(data: Snapshot, today = riyadhToday()) {
  const alerts = coachingAlerts(data,today);
  return data.clients.map(client => {
    const status = data.management?.details.find(d => d.client_id === client.id)?.status ?? "active";
    const inactive = client.archived || status === "inactive";
    const programs = data.programs.filter(p => p.client_id === client.id);
    const published = programs.filter(p => p.published_at).sort((a,b) => b.published_at!.localeCompare(a.published_at!))[0];
    const draft = programs.some(p => !p.published_at);
    const ownAlerts = inactive ? [] : alerts.filter(a => a.clientId === client.id && a.kind !== "new" && a.kind !== "renewal");
    const records = (data.management?.records ?? []).filter(r => r.client_id === client.id && r.entry_date <= today);
    const checkin = records.filter(r => r.kind === "checkin").sort((a,b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at))[0];
    const weights = (data.weights ?? []).filter(w => w.client_id === client.id && w.entry_date <= today && Number.isFinite(Number(w.weight))).sort((a,b) => a.entry_date.localeCompare(b.entry_date));
    const latestWeight = weights.at(-1);
    const weightChange = weights.length > 1 ? Number(latestWeight!.weight) - Number(weights.at(-2)!.weight) : null;
    const subscription = latestSubscription(data.subscriptions, client.id);
    const renew = !inactive && renewalDue(data.subscriptions, client.id, today);
    const needsProgram = !inactive && !published;
    const priority = inactive ? -1 : ownAlerts.some(a => a.urgent) ? 100 : needsProgram ? 80 : renew ? 60 : ownAlerts.length ? 40 : 0;
    const nutrition = effectiveNutrition(records, client.id, published?.published_at, today) ?? published?.content.nutrition;
    return {client, status, inactive, published, draft, alerts:ownAlerts, checkin, weights, latestWeight, weightChange, subscription, renew, needsProgram, priority, nutrition,
      attention: !inactive && (needsProgram || renew || ownAlerts.length > 0),
      subscriptionDays:subscription ? daysBetween(today, subscription.end_date) : null};
  });
}
export type RosterRow = ReturnType<typeof clientRoster>[number];

export function rosterMatches(row:RosterRow, filter:string, query:string) {
  if ((filter === "archived" ? !row.client.archived : row.client.archived) || !clientMatchesQuery(row.client,query)) return false;
  if (filter === "attention") return row.attention;
  if (filter === "program") return row.needsProgram;
  if (filter === "renew") return row.renew;
  if (["active","inactive","new"].includes(filter)) return row.status === filter;
  if (["checkin","adherence","stalled"].includes(filter)) return row.alerts.some(a => a.kind === filter);
  return true;
}
export function compareRoster(a:RosterRow,b:RosterRow,sort:string,language:string) {
  const byName=()=>a.client.name.localeCompare(b.client.name,language) || a.client.id.localeCompare(b.client.id);
  if(sort === "name")return byName();
  if(sort === "renewal")return (a.subscription?.end_date??"9999").localeCompare(b.subscription?.end_date??"9999") || byName();
  if(sort === "newest" || sort === "oldest")return (sort === "newest" ? b.client.created_at.localeCompare(a.client.created_at) : a.client.created_at.localeCompare(b.client.created_at)) || byName();
  return b.priority-a.priority || byName();
}

export function rosterCounts(rows:RosterRow[]) {
  const live=rows.filter(r=>!r.client.archived);
  return {all:live.length,attention:live.filter(r=>r.attention).length,program:live.filter(r=>r.needsProgram).length,renew:live.filter(r=>r.renew).length,archived:rows.length-live.length};
}
