import { addDays } from "./dates";
import type { Subscription } from "./model";

export function latestSubscription(subscriptions: Subscription[], clientId: string) {
  return subscriptions.filter(s => s.client_id === clientId).sort((a,b) => b.end_date.localeCompare(a.end_date))[0];
}

export function addCalendarMonths(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/**
 * One rule for every subscription: a month ends on the same day of the following
 * month (12 Nov → 12 Dec). Renewals start the day after the current end so periods
 * never overlap; expired or first subscriptions start today.
 */
export function subscriptionPeriod(today: string, months: number, previous?: Pick<Subscription, "end_date">) {
  const continuing = Boolean(previous && previous.end_date >= today);
  const start = continuing ? addDays(previous!.end_date, 1) : today;
  return { start, end: addCalendarMonths(start, months) };
}

export type FinanceSummary = { monthRevenue: number; renewalsDue: number; renewalsCount: number; expired: number };
/**
 * Coach-entered subscription values (payments happen outside the platform):
 * - monthRevenue: value of subscriptions starting in the current calendar month.
 * - renewalsDue: value of each active trainee's latest subscription ending within 30 days,
 *   assuming it renews at the same value.
 * - expired: active trainees whose latest subscription already ended.
 */
export function financeSummary(subscriptions: Subscription[], activeClientIds: string[], today: string): FinanceSummary {
  const month = today.slice(0, 7);
  const active = new Set(activeClientIds);
  const monthRevenue = subscriptions.filter(s => active.has(s.client_id) && s.start_date.slice(0, 7) === month).reduce((sum, s) => sum + Number(s.price), 0);
  const horizon = addDays(today, 30);
  let renewalsDue = 0, renewalsCount = 0, expired = 0;
  for (const id of active) {
    const latest = latestSubscription(subscriptions, id);
    if (!latest) continue;
    if (latest.end_date < today) expired++;
    else if (latest.end_date <= horizon) { renewalsDue += Number(latest.price); renewalsCount++; }
  }
  return { monthRevenue: Math.round(monthRevenue * 100) / 100, renewalsDue: Math.round(renewalsDue * 100) / 100, renewalsCount, expired };
}
