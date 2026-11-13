import {describe,expect,it} from "vitest";
import {addCalendarMonths,financeSummary,subscriptionPeriod} from "@/lib/subscription-period";

describe("date-only subscriptions", () => {
  it("clamps calendar month ends and leap years without rolling into March", () => {
    expect(addCalendarMonths("2026-01-31",1)).toBe("2026-02-28");
    expect(addCalendarMonths("2024-02-29",12)).toBe("2025-02-28");
    expect(addCalendarMonths("2027-11-30",3)).toBe("2028-02-29");
  });
  it("extends an active subscription from its existing end with no overlap", () => {
    expect(subscriptionPeriod("2026-11-10",1,{end_date:"2026-11-30"})).toEqual({start:"2026-12-01",end:"2027-01-01"});
    expect(subscriptionPeriod("2026-11-10",12,{end_date:"2026-11-30"})).toEqual({start:"2026-12-01",end:"2027-12-01"});
  });
  it("starts expired and first subscriptions today instead of consuming their duration in the past", () => {
    expect(subscriptionPeriod("2026-11-10",1,{end_date:"2026-01-01"})).toEqual({start:"2026-11-10",end:"2026-12-10"});
    expect(subscriptionPeriod("2026-11-10",12)).toEqual({start:"2026-11-10",end:"2027-11-10"});
  });
  it("renews a subscription expiring today from tomorrow", () => {
    expect(subscriptionPeriod("2026-11-10",1,{end_date:"2026-11-10"})).toEqual({start:"2026-11-11",end:"2026-12-11"});
  });
  it("uses one rule: a month ends on the same day of the next month", () => {
    expect(subscriptionPeriod("2026-11-07",1)).toEqual({start:"2026-11-07",end:"2026-12-07"});
    expect(subscriptionPeriod("2026-11-12",1)).toEqual({start:"2026-11-12",end:"2026-12-12"});
    expect(subscriptionPeriod("2026-11-05",1,{end_date:"2026-11-11"})).toEqual({start:"2026-11-12",end:"2026-12-12"});
    expect(subscriptionPeriod("2026-01-31",1)).toEqual({start:"2026-01-31",end:"2026-02-28"});
  });
});

describe("subscriptions summary", () => {
  const sub = (client_id: string, start_date: string, end_date: string, price: number) => ({ id: crypto.randomUUID(), client_id, name: "x", start_date, end_date, price }) as never;
  it("sums this month, renewals due in 30 days and counts expired trainees", () => {
    const subs = [
      sub("a", "2026-11-01", "2026-12-01", 650),   // starts this month, renews within 30 days
      sub("b", "2026-10-01", "2026-10-31", 400),   // expired
      sub("c", "2026-10-20", "2026-11-20", 300.5), // renews within 30 days
      sub("d", "2026-11-05", "2027-02-05", 1200),  // starts this month, ends later
      sub("e", "2026-11-02", "2026-12-02", 999),   // archived trainee: ignored
    ];
    expect(financeSummary(subs, ["a", "b", "c", "d"], "2026-11-13")).toEqual({ monthRevenue: 1850, renewalsDue: 950.5, renewalsCount: 2, expired: 1 });
  });
  it("does not count an expired subscription that was already renewed", () => {
    const subs = [sub("a", "2026-09-01", "2026-10-01", 500), sub("a", "2026-10-02", "2027-01-02", 1500)];
    expect(financeSummary(subs, ["a"], "2026-11-13")).toEqual({ monthRevenue: 0, renewalsDue: 0, renewalsCount: 0, expired: 0 });
  });
});
