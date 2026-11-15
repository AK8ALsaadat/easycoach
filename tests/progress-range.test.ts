import { expect, it } from "vitest";
import { progressRange } from "@/lib/progress-range";

it("shows the selected historical month even when today is much later", () => {
  const points = [{ date: "2025-01-10", value: 80 }, { date: "2025-01-31", value: 78 }, { date: "2026-01-01", value: 75 }];
  expect(progressRange(points, "30", "", "2025-01-31")).toEqual({ lower: "2025-01-01", selected: points.slice(0, 2) });
});
it("honors explicit dates, sorts without mutating, and excludes invalid measurements", () => {
  const points = [{ date: "2025-02-20", value: 78 }, { date: "2025-02-02", value: NaN }, { date: "2025-02-01", value: 80 }];
  expect(progressRange(points, "all", "", "2025-02-28").selected.map(p => p.value)).toEqual([80, 78]);
  expect(progressRange(points, "30", "2025-02-15", "2025-02-28").selected.map(p => p.value)).toEqual([78]);
  expect(points[0].date).toBe("2025-02-20");
  expect(progressRange([], "all", "", "2025-02-28")).toEqual({ lower: "2025-02-28", selected: [] });
});
