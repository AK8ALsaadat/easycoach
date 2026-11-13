import type { CoachingRecord, ManagementData } from "./management";
import type { WeightEntry } from "./model";
export const comparisonMetricKeys = ["weight", "body_fat", "waist", "chest", "hips", "arm", "thigh", "calf"] as const;
export type ComparisonMetric = typeof comparisonMetricKeys[number];
export type ComparisonMetrics = Partial<Record<ComparisonMetric, number>>;
export function progressComparisonDates(clientId: string, photos: ManagementData["progress_photos"], measurements: CoachingRecord[], weights: WeightEntry[]) {
  return [...new Set([
    ...photos.filter(item => item.client_id === clientId && item.status === "ready").map(item => item.entry_date),
    ...measurements.filter(item => item.client_id === clientId && item.kind === "measurement" && !item.payload.historical_only).map(item => item.entry_date),
    ...weights.filter(item => item.client_id === clientId).map(item => item.entry_date),
  ])].sort();
}
export function progressMetricsForDate(clientId: string, date: string, measurements: CoachingRecord[], weights: WeightEntry[]): ComparisonMetrics | null {
  if (!date) return null;
  const result: ComparisonMetrics = {};
  for (const record of measurements.filter(item => item.client_id === clientId && item.kind === "measurement" && item.entry_date === date && !item.payload.historical_only)
    .toSorted((a, b) => (a.updated_at ?? a.created_at).localeCompare(b.updated_at ?? b.created_at))) {
    for (const key of comparisonMetricKeys) {
      const value = record.payload[key];
      if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    }
  }
  const weight = weights.filter(item => item.client_id === clientId && item.entry_date === date).toSorted((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (weight && Number.isFinite(Number(weight.weight))) result.weight = Number(weight.weight);
  return result;
}
