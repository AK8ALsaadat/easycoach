import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CoachToday } from "@/components/coach-today";
import { addDays, riyadhToday } from "@/lib/dates";
import { defaultPreferences } from "@/lib/management";
import type { Snapshot } from "@/lib/model";

it("uses the assigned weight cadence for dashboard follow-up instead of an extra seven-day reminder", () => {
  const today = riyadhToday();
  const data = {
    profile: { id: "coach", name: "مدرب اختبار", role: "coach" },
    clients: [{ id: "client", coach_id: "coach", name: "متدرب اختبار", email: "fixture@example.test", phone: "", archived: false, created_at: addDays(today, -15) + "T12:00:00Z" }],
    programs: [], subscriptions: [], freezes: [], templates: [],
    weights: [{ id: "weight", client_id: "client", weight: 80, entry_date: addDays(today, -8), updated_at: today + "T12:00:00Z" }],
    client_goals: [{ client_id: "client", target_weight: 75 }],
    management: { details: [], records: [], progress_photos: [], schedules: [{ client_id: "client", weight_days: 30, measurement_days: 30, photo_days: 30 }], preferences: { ...defaultPreferences, checkin_days: 30 } },
  } as unknown as Snapshot;
  const html = renderToStaticMarkup(createElement(CoachToday, { data, tutorialDismissed: true }));
  expect(html).not.toContain("متابعة وزن");
  expect(html).not.toContain("تحديث الوزن متأخر");
  data.management!.schedules![0].weight_days = 7;
  const overdue = renderToStaticMarkup(createElement(CoachToday, { data, tutorialDismissed: true }));
  expect(overdue).toContain("تحديث الوزن متأخر");
});
