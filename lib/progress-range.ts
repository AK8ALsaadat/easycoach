import { addDays } from "./dates";

/** A historical end date must move the entire window, not just its upper edge. */
export function progressRange(points: { date: string; value: number }[], range: string, from: string, to: string) {
  const valid = points.filter(point => point.date <= to && Number.isFinite(point.value)).sort((a, b) => a.date.localeCompare(b.date));
  const lower = from || (range === "all" ? valid[0]?.date ?? to : addDays(to, -Number(range)));
  return { lower, selected: valid.filter(point => point.date >= lower) };
}
