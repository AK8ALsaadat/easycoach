import { describe, expect, it } from "vitest";
import { buildPromoDataset, promoId, PROMO_VERSION } from "@/scripts/promo-dataset";
import { content, commands, id } from "@/lib/model";
import { detailsSchema, recordInput, recordSchemas } from "@/lib/management";
import { publishIssues } from "@/lib/program-validation";
import { catalogById } from "@/lib/catalog";

const today = "2026-11-13";
const data = buildPromoDataset(today);
describe("promotion fixture dataset", () => {
  it("is deterministic, exactly scoped and visibly identified as simulated data", () => {
    expect(buildPromoDataset(today)).toEqual(data);
    expect(data.version).toBe(PROMO_VERSION);
    expect(data.synthetic).toBe(true);
    expect(data.clients).toHaveLength(40);
    expect(data.clients.filter(client => client.successCase)).toHaveLength(6);
    expect(data.clients.filter(client => client.accountRequested)).toHaveLength(5);
    expect(data.clients.slice(0, 5).every(client => client.accountRequested)).toBe(true);
    expect(new Set(data.clients.map(client => client.email)).size).toBe(40);
    expect(data.clients.every(client => client.email.endsWith("@example.test"))).toBe(true);
    expect(data.clients.every(client => client.goal.notes.includes("اصطناعي"))).toBe(true);
    expect(data.clients[0].joined).toBe("2025-11-14");
    expect(data.clients.at(-1)!.joined).toBe("2026-11-10");
    expect(new Set(data.clients.map(client => client.joined.slice(0, 7))).size).toBeGreaterThanOrEqual(12);
    const lastQuarter = data.clients.filter(client => client.joined >= "2026-08-15").length;
    const previousQuarter = data.clients.filter(client => client.joined >= "2026-05-17" && client.joined < "2026-08-15").length;
    expect(lastQuarter).toBeGreaterThan(previousQuarter);
    for (const invalid of ["", "2026-02-30", "2026-13-01", "not-a-date"]) expect(() => buildPromoDataset(invalid)).toThrow();
  });

  it("validates every generated profile, prescription and historical payload against production schemas", () => {
    for (const client of data.clients) {
      expect(commands.client_save.safeParse({ id: client.id, name: client.name, email: client.email, phone: client.phone }).success, client.name).toBe(true);
      expect(detailsSchema.safeParse(client.details).success, client.name).toBe(true);
      expect(content.safeParse(client.program.content).success, client.name).toBe(true);
      expect(publishIssues(client.program.content)).toEqual([]);
      for (const day of client.program.content.days) {
        for (const exercise of day.exercises) expect(catalogById.has(exercise.catalogId!)).toBe(true);
      }
      const target = client.program.content.nutrition;
      expect(target.meals!.reduce((sum, meal) => sum + meal.calories, 0)).toBe(target.calories);
      for (const record of client.records) {
        const checked = recordSchemas[record.kind].safeParse(record.payload);
        expect(checked.success, `${client.name} ${record.source_key}: ${checked.error?.message ?? ""}`).toBe(true);
        expect(recordInput.safeParse({ id: record.id, client_id: client.id, kind: record.kind, entry_date: record.entry_date, source_key: record.source_key, author_type: record.author_type, payload: record.payload }).success).toBe(true);
        expect(record.source_key.startsWith(PROMO_VERSION)).toBe(true);
        expect(record.entry_date >= client.joined && record.entry_date <= today).toBe(true);
      }
      expect(client.records.some(record => record.kind === "workout_log")).toBe(true);
      expect(client.records.some(record => record.kind === "checkin")).toBe(true);
      expect(client.records.some(record => record.kind === "nutrition_target")).toBe(true);
      expect(client.program.published_at.slice(0, 10) >= client.joined).toBe(true);
      expect(client.program.published_at.slice(0, 10) <= today).toBe(true);
    }
  });

  it("uses unique repeatable UUIDs and stable source keys instead of duplicating rows on retries", () => {
    const ids: string[] = [];
    for (const client of data.clients) {
      ids.push(client.id, client.program.id, ...client.weights.map(row => row.id), ...client.records.map(row => row.id));
      for (const row of client.subscriptions) ids.push(row.id, ...row.payments.map(payment => payment.id), ...row.freezes.map(freeze => freeze.id));
      expect(new Set(client.records.map(record => `${record.kind}:${record.source_key}`)).size).toBe(client.records.length);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(value => id.safeParse(value).success)).toBe(true);
    expect(promoId("client:0")).toBe(data.clients[0].id);
    expect(buildPromoDataset("2026-11-14").clients.map(client => client.id)).toEqual(data.clients.map(client => client.id));
  });

  it("builds gradual success histories, honest gaps, mixed recency and actual increasing exercise loads", () => {
    for (const client of data.clients.slice(0, 3)) {
      const weights = client.weights;
      expect(weights.length).toBeGreaterThan(35);
      expect(client.outcome.weightChange).toBeLessThanOrEqual(-11.5);
      expect(client.outcome.weightChange).toBeGreaterThanOrEqual(-18.5);
      for (let i = 1; i < weights.length; i++) expect(Math.abs(weights[i].weight - weights[i - 1].weight)).toBeLessThan(2.1);
    }
    for (const client of data.clients.slice(3, 6)) {
      expect(client.outcome.weightChange).toBeGreaterThan(3);
      expect(client.outcome.currentLoad - client.outcome.firstLoad).toBeGreaterThanOrEqual(27.5);
    }
    expect(data.clients.some(client => client.details.status === "inactive")).toBe(true);
    expect(data.clients.some(client => client.details.status === "new")).toBe(true);
    expect(data.clients.some(client => client.weights.at(-1)!.entry_date < "2026-11-01")).toBe(true);
    expect(data.clients.some(client => client.records.some(record => record.kind === "workout_log" && !record.payload.completed))).toBe(true);
    expect(data.clients.some(client => client.records.some(record => record.kind === "checkin" && !record.reviewed_at))).toBe(true);
    expect(new Set(data.clients.map(client => client.program.name)).size).toBe(3);
    expect(data.clients.filter(client => client.program.content.days.length === 4).length).toBeGreaterThan(0);
    expect(data.clients.find(client => client.program.name.startsWith("دفع"))!.program.content.days.map(day => day.name)).toEqual(["دفع", "سحب", "أرجل"]);
    expect(data.clients.filter(client => client.goal.goal.includes("بطولة"))).toHaveLength(2);
  });

  it("keeps renewal chains, payment totals and freeze extensions financially coherent", () => {
    let partial = 0, unpaid = 0, frozen = 0;
    for (const client of data.clients) for (const [index, row] of client.subscriptions.entries()) {
      expect(row.previous_id).toBe(index ? client.subscriptions[index - 1].id : null);
      expect(commands.subscription_create.safeParse({ client_id: client.id, name: row.name, start_date: row.start_date, end_date: row.end_date, price: row.price, ...(row.previous_id ? { previous_id: row.previous_id } : {}) }).success).toBe(true);
      if (index) expect(row.start_date > client.subscriptions[index - 1].end_date).toBe(true);
      const paid = row.payments.reduce((sum, payment) => sum + payment.amount, 0);
      expect(paid).toBeLessThanOrEqual(row.price);
      if (!paid) unpaid++;
      if (paid && paid < row.price) partial++;
      for (const payment of row.payments) {
        expect(commands.payment_add.safeParse({ id: payment.id, subscription_id: row.id, amount: payment.amount, method: payment.method, paid_date: payment.paid_date, reference: payment.reference }).success).toBe(true);
        expect(payment.paid_date <= today).toBe(true);
      }
      for (const freeze of row.freezes) {
        frozen++;
        expect(commands.freeze_apply.safeParse({ id: freeze.id, subscription_id: row.id, start_date: freeze.start_date, end_date: freeze.end_date }).success).toBe(true);
        expect(freeze.start_date >= row.start_date && freeze.end_date <= row.end_date).toBe(true);
        expect(freeze.days).toBe(7);
        expect((Date.parse(row.end_date) - Date.parse(row.start_date)) / 86400000 + 1).toBe(97);
      }
    }
    expect(partial).toBeGreaterThan(0);
    expect(unpaid).toBeGreaterThan(0);
    expect(frozen).toBeGreaterThan(0);
    expect(data.statusSummary.frozenNow).toBe(2);
    expect(data.statusSummary.expired).toBe(3);
    expect(data.statusSummary.nearExpiry).toBe(5);
    expect(data.summary.receivedSar).toBeGreaterThan(0);
  });
});
