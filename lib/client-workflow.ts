import type { Client, Subscription } from "./model";
import { addDays } from "./dates";

export function normalizeClientSearch(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0)).trim();
}

export function clientMatchesQuery(client: Pick<Client, "name" | "email" | "phone">, query: string) {
  const text = normalizeClientSearch(`${client.name} ${client.email}`);
  const phone = normalizeClientSearch(client.phone);
  const terms = normalizeClientSearch(query).split(/\s+/);
  const numericOnly = terms.every(term => /^\d+$/.test(term));
  return terms.every(term => text.includes(term) || ((numericOnly || term.length >= 3) && phone.includes(term)));
}

export function renewalDue(subscriptions: Subscription[], clientId: string, today: string) {
  const own = subscriptions.filter(sub => sub.client_id === clientId);
  // A paid-for future renewal should not keep the old contract in the follow-up queue.
  if (own.some(sub => sub.start_date > today)) return false;
  const latest = own.reduce<Subscription | undefined>((found, sub) => !found || sub.end_date > found.end_date ? sub : found, undefined);
  return Boolean(latest && latest.start_date <= today && latest.end_date <= addDays(today, 7));
}
