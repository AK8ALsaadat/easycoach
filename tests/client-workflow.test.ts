import { describe, expect, it } from "vitest";
import { clientMatchesQuery, renewalDue } from "@/lib/client-workflow";
import type { Subscription } from "@/lib/model";

const sub = (start: string, end: string, client = "a") => ({ client_id: client, start_date: start, end_date: end }) as Subscription;
describe("coach client workflow", () => {
  it("does not confuse a trainee number in a name query with a digit in someone else's phone", () => {
    expect(clientMatchesQuery({name:"personal Client 1",email:"personal-1@test.test",phone:"0501234567"},"Client personal 2")).toBe(false);
    expect(clientMatchesQuery({name:"personal Client 2",email:"personal-2@test.test",phone:""},"Client personal 2")).toBe(true);
  });
  it("finds Arabic names despite hamza, diacritics, spacing and word order", () => {
    expect(clientMatchesQuery({ name: "أَحمد بن علي", email: "coach@test.test", phone: "0501234567" }, "  علي   احمد ")).toBe(true);
  });
  it("matches phone numbers typed with Arabic digits without matching another client", () => {
    const client = { name: "علي", email: "ali@test.test", phone: "0501234567" };
    expect(clientMatchesQuery(client, "٠٥٠١٢٣٤٥٦٧")).toBe(true);
    expect(clientMatchesQuery(client, "خالد")).toBe(false);
  });
  it("removes an expiring or expired subscription from follow-up after renewal", () => {
    const today = "2026-11-10";
    expect(renewalDue([sub("2026-10-01", "2026-11-12"), sub("2026-11-13", "2026-12-13")], "a", today)).toBe(false);
    expect(renewalDue([sub("2026-09-01", "2026-10-01"), sub("2026-11-01", "2026-12-01")], "a", today)).toBe(false);
  });
  it("includes overdue and seven-day renewals but excludes future-only and other clients", () => {
    const today = "2026-11-10";
    expect(renewalDue([sub("2026-10-01", "2026-11-01")], "a", today)).toBe(true);
    expect(renewalDue([sub("2026-11-01", "2026-11-17")], "a", today)).toBe(true);
    expect(renewalDue([sub("2026-11-11", "2026-11-17")], "a", today)).toBe(false);
    expect(renewalDue([sub("2026-10-01", "2026-11-12", "b")], "a", today)).toBe(false);
  });
});
