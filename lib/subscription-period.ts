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

export function subscriptionPeriod(today: string, months: number, previous?: Pick<Subscription, "end_date">) {
  const continuing = Boolean(previous && previous.end_date >= today);
  const start = continuing ? addDays(previous!.end_date, 1) : today;
  const end = continuing ? addCalendarMonths(previous!.end_date, months) : addDays(addCalendarMonths(start, months), -1);
  return { start, end };
}
