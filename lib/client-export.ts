import type { Snapshot } from "./model";
import { csvCell } from "./import-preview";

/** Everything the coach holds about one trainee, scoped from the coach's own snapshot. */
export function clientExport(data: Snapshot, clientId: string) {
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return null;
  const subscriptions = data.subscriptions.filter((s) => s.client_id === clientId);
  const subscriptionIds = new Set(subscriptions.map((s) => s.id));
  const management = data.management;
  return {
    exported_at: new Date().toISOString(),
    notice: "سجل الدفعات ليس فاتورة ضريبية",
    client,
    goal: data.client_goals?.find((g) => g.client_id === clientId) ?? null,
    details: management?.details.find((d) => d.client_id === clientId) ?? null,
    programs: data.programs.filter((p) => p.client_id === clientId),
    weights: (data.weights ?? []).filter((w) => w.client_id === clientId),
    records: (management?.records ?? []).filter((r) => r.client_id === clientId),
    progress_photos: (management?.progress_photos ?? [])
      .filter((p) => p.client_id === clientId)
      .map(({ id, entry_date, angle, created_at }) => ({ id, entry_date, angle, created_at })),
    subscriptions,
    freezes: data.freezes.filter((f) => subscriptionIds.has(f.subscription_id)),
    payments: data.payments.filter((p) => subscriptionIds.has(p.subscription_id)),
  };
}

/** One flat CSV (section, date, item, value) that opens cleanly in Excel. */
export function clientExportCsv(exported: NonNullable<ReturnType<typeof clientExport>>) {
  const rows: (string | number)[][] = [["القسم", "التاريخ", "البيان", "القيمة"]];
  const { client } = exported;
  rows.push(["المتدرب", client.created_at.slice(0, 10), "الاسم", client.name]);
  rows.push(["المتدرب", "", "الإيميل", client.email]);
  if (client.phone) rows.push(["المتدرب", "", "الجوال", client.phone]);
  if (exported.goal) rows.push(["الهدف", "", exported.goal.goal || "—", exported.goal.target_weight ?? ""]);
  for (const w of exported.weights) rows.push(["الوزن", w.entry_date, "كجم", w.weight]);
  for (const p of exported.programs)
    rows.push(["البرامج", (p.published_at ?? p.created_at).slice(0, 10), p.name, p.published_at ? "منشور" : "مسودة"]);
  for (const r of exported.records) {
    const payload = r.payload as Record<string, unknown>;
    const summary = r.kind === "message" || r.kind === "note" ? String(payload.text ?? "") : JSON.stringify(payload);
    rows.push([r.kind, r.entry_date, r.author_type === "client" ? "المتدرب" : "المدرب", summary]);
  }
  for (const s of exported.subscriptions) rows.push(["الاشتراكات", s.start_date, `${s.name} حتى ${s.end_date}`, s.price]);
  for (const p of exported.payments) rows.push(["الدفعات", p.paid_date, p.kind === "reversal" ? "عكس" : p.method, p.amount]);
  for (const p of exported.progress_photos) rows.push(["صور التقدم", p.entry_date, p.angle, p.id]);
  return "﻿" + rows.map((row) => row.map((cell) => csvCell(String(cell))).join(",")).join("\r\n");
}
