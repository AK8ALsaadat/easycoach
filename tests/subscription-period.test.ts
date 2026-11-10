import {describe,expect,it} from "vitest";
import {addCalendarMonths,subscriptionPeriod} from "@/lib/subscription-period";

describe("date-only subscriptions", () => {
  it("clamps calendar month ends and leap years without rolling into March", () => {
    expect(addCalendarMonths("2026-01-31",1)).toBe("2026-02-28");
    expect(addCalendarMonths("2024-02-29",12)).toBe("2025-02-28");
    expect(addCalendarMonths("2027-11-30",3)).toBe("2028-02-29");
  });
  it("extends an active subscription from its existing end with no overlap", () => {
    expect(subscriptionPeriod("2026-11-10",1,{end_date:"2026-11-30"})).toEqual({start:"2026-12-01",end:"2026-12-30"});
    expect(subscriptionPeriod("2026-11-10",12,{end_date:"2026-11-30"})).toEqual({start:"2026-12-01",end:"2027-11-30"});
  });
  it("starts expired and first subscriptions today instead of consuming their duration in the past", () => {
    expect(subscriptionPeriod("2026-11-10",1,{end_date:"2026-01-01"})).toEqual({start:"2026-11-10",end:"2026-12-09"});
    expect(subscriptionPeriod("2026-11-10",12)).toEqual({start:"2026-11-10",end:"2027-11-09"});
  });
  it("renews a subscription expiring today from tomorrow", () => {
    expect(subscriptionPeriod("2026-11-10",1,{end_date:"2026-11-10"})).toEqual({start:"2026-11-11",end:"2026-12-10"});
  });
});
