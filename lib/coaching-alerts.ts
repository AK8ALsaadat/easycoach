import type { Snapshot } from "./model";
import { defaultPreferences } from "./management";
import { addDays, daysBetween, riyadhToday } from "./dates";
export type CoachingAlert = {
  clientId: string;
  kind:
    | "checkin"
    | "weight"
    | "adherence"
    | "stalled"
    | "message"
    | "renewal"
    | "new";
  // Scheduled workout reminders are based on explicitly configured weekdays.
  label: string;
  urgent: boolean;
  date?: string;
};
export function coachingAlerts(data: Snapshot): CoachingAlert[] {
  const preferences = {
      ...defaultPreferences,
      ...data.management?.preferences,
    },
    today = riyadhToday(),
    records = data.management?.records ?? [],
    alerts: CoachingAlert[] = [];
  for (const client of data.clients.filter(
    (client) =>
      !client.archived &&
      data.management?.details.find((detail) => detail.client_id === client.id)
        ?.status !== "inactive",
  )) {
    const own = records.filter((record) => record.client_id === client.id),
      checkins = own
        .filter((record) => record.kind === "checkin")
        .sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
      latest = checkins[0];
    if (checkins.some((record) => !record.reviewed_at))
      alerts.push({
        clientId: client.id,
        kind: "checkin",
        label: "مراجعة أسبوعية تنتظر ردك",
        urgent: true,
      });
    if (
      own.some(
        (record) =>
          record.kind === "message" &&
          record.author_type === "client" &&
          !record.read_at,
      )
    )
      alerts.push({
        clientId: client.id,
        kind: "message",
        label: "رسالة جديدة من المتدرب",
        urgent: true,
      });
    if (preferences.reminders) {
      const weekday = new Date(today + "T12:00:00Z").getUTCDay();
      const published = data.programs.find(
        (p) => p.client_id === client.id && p.published_at,
      );
      if (
        published?.content.days.some((day) => day.weekday === weekday) &&
        !own.some(
          (r) =>
            r.kind === "workout_log" &&
            r.entry_date === today &&
            r.payload.completed === true,
        )
      )
        alerts.push({
          clientId: client.id,
          kind: "adherence",
          label: "تدريب اليوم بلا تسجيل",
          urgent: false,
          date: today,
        });
      const since = latest?.entry_date ?? client.created_at.slice(0, 10);
      if (daysBetween(since, today) >= preferences.checkin_days)
        alerts.push({
          clientId: client.id,
          kind: "checkin",
          label: "موعد المراجعة الأسبوعية متأخر",
          urgent: false,
          date: since,
        });
      const weights = (data.weights ?? [])
          .filter((weight) => weight.client_id === client.id)
          .sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
        last = weights.at(-1);
      if (
        daysBetween(
          last?.entry_date ?? client.created_at.slice(0, 10),
          today,
        ) >= preferences.weight_days
      )
        alerts.push({
          clientId: client.id,
          kind: "weight",
          label: "تحديث الوزن متأخر",
          urgent: false,
          date: last?.entry_date,
        });
      const target = data.client_goals?.find(
        (goal) => goal.client_id === client.id,
      )?.target_weight;
      const recent = weights.filter(
        (weight) => weight.entry_date >= addDays(today, -30),
      );
      if (
        target &&
        recent.length >= 3 &&
        daysBetween(recent[0].entry_date, recent.at(-1)!.entry_date) >= 14 &&
        Math.abs(Number(last?.weight) - target) > 1 &&
        Math.abs(Number(recent.at(-1)!.weight) - Number(recent[0].weight)) < 0.2
      )
        alerts.push({
          clientId: client.id,
          kind: "stalled",
          label: "الوزن مستقر منذ أسبوعين؛ راجع الخطة",
          urgent: false,
        });
      if (
        latest &&
        daysBetween(latest.entry_date, today) <= 14 &&
        (Number(latest.payload.training_adherence) <
          preferences.low_adherence ||
          Number(latest.payload.nutrition_adherence) <
            preferences.low_adherence)
      )
        alerts.push({
          clientId: client.id,
          kind: "adherence",
          label: "التزام منخفض حسب المراجعة الأخيرة",
          urgent: false,
          date: latest.entry_date,
        });
    }
    if (
      data.management?.details.some(
        (detail) => detail.client_id === client.id && detail.status === "new",
      ) ||
      daysBetween(client.created_at.slice(0, 10), today) <= 7
    )
      alerts.push({
        clientId: client.id,
        kind: "new",
        label: "متدرب جديد",
        urgent: false,
      });
    for (const subscription of data.subscriptions.filter(
      (subscription) =>
        subscription.client_id === client.id &&
        subscription.end_date <= addDays(today, 7),
    )) {
      if (
        !data.subscriptions.some(
          (next) =>
            next.client_id === client.id &&
            next.start_date > subscription.end_date,
        )
      )
        alerts.push({
          clientId: client.id,
          kind: "renewal",
          label: "اشتراك يحتاج تجديدًا",
          urgent: subscription.end_date < today,
          date: subscription.end_date,
        });
    }
  }
  return alerts.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}
