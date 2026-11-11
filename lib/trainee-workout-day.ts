import type { Content } from "./model";

export function resolveWorkoutDay(
  selected: number | null,
  days: Content["days"],
  weekday: number,
) {
  const scheduled = days.findIndex(day => day.weekday === weekday);
  const hasSchedule = days.some(day => day.weekday !== undefined);
  if (selected !== null && selected >= 0 && selected < days.length) return selected;
  if (selected === -1 && hasSchedule) return -1;
  return scheduled >= 0 ? scheduled : hasSchedule || !days.length ? -1 : 0;
}
