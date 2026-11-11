import { daysBetween } from "./dates";
import type { CoachingRecord, ManagementData } from "./management";
import type { WeightEntry } from "./model";

export type CheckinStatus = {
  kind: "weight" | "measurement" | "photo";
  due: boolean;
  daysRemaining: number | null;
};
const measurementFields = ["waist", "chest", "hips", "arm", "thigh", "calf"] as const;

export function traineeCheckinStatus(
  clientId: string,
  today: string,
  weights: WeightEntry[],
  records: CoachingRecord[],
  management?: ManagementData,
): CheckinStatus[] {
  const schedule = management?.schedules?.find((row) => row.client_id === clientId);
  const ownRecords = records.filter((record) => record.client_id === clientId);
  const latestWeight = weights.filter((row) => row.client_id === clientId).map((row) => row.entry_date).sort().at(-1);
  const latestMeasurement = ownRecords.filter((record) =>
    record.kind === "measurement" &&
    !record.payload.historical_only &&
    measurementFields.some((field) => typeof record.payload[field] === "number"),
  ).map((record) => record.entry_date).sort().at(-1);
  const latestPhoto = management?.progress_photos
    ?.filter((photo) => photo.client_id === clientId && photo.status === "ready")
    .map((photo) => photo.entry_date).sort().at(-1);
  const rows: { kind: CheckinStatus["kind"]; last?: string; interval: number }[] = [
    { kind: "weight", last: latestWeight, interval: schedule?.weight_days ?? management?.preferences.weight_days ?? 7 },
    { kind: "measurement", last: latestMeasurement, interval: schedule?.measurement_days ?? 30 },
    { kind: "photo", last: latestPhoto, interval: schedule?.photo_days ?? 30 },
  ];
  return rows.map(({ kind, last, interval }) => ({
    kind,
    due: Boolean(last && daysBetween(last, today) >= Number(interval)),
    daysRemaining: last ? Math.max(0, Number(interval) - daysBetween(last, today)) : null,
  }));
}
