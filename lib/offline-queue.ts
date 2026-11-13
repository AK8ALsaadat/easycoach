// Weights logged without a connection wait on this device and are sent when the
// connection returns. Only the date and value are stored, per trainee link.
export type QueuedWeight = { client_id: string; entry_date: string; weight: number; queued_at: string };
const KEY = "ec_offline_weights";
export const QUEUE_EVENT = "easycoach:offline-queue";

export function readQueue(): QueuedWeight[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is QueuedWeight => typeof item?.client_id === "string" && typeof item?.entry_date === "string" && typeof item?.weight === "number")
      : [];
  } catch {
    return [];
  }
}
function write(items: QueuedWeight[]) {
  try {
    if (items.length) window.localStorage.setItem(KEY, JSON.stringify(items));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* Storage blocked: the entry cannot wait offline; the caller reports it. */
    return false;
  }
  window.dispatchEvent(new Event(QUEUE_EVENT));
  return true;
}
/** One pending value per day: a later entry for the same day replaces the earlier one. */
export function queueWeight(item: Omit<QueuedWeight, "queued_at">, now = new Date()) {
  const rest = readQueue().filter((q) => !(q.client_id === item.client_id && q.entry_date === item.entry_date));
  return write([...rest, { ...item, queued_at: now.toISOString() }]);
}
export function clearQueue() {
  write([]);
}

/**
 * Sends queued weights in order. Items are removed once the server answered
 * (saved, or rejected with a reason); network failures keep them for later.
 */
export async function flushQueue(send: (item: QueuedWeight) => Promise<{ ok: boolean; message?: string }>) {
  const errors: string[] = [];
  let sent = 0;
  for (const item of readQueue()) {
    try {
      const result = await send(item);
      write(readQueue().filter((q) => !(q.client_id === item.client_id && q.entry_date === item.entry_date && q.queued_at === item.queued_at)));
      if (result.ok) sent++;
      else if (result.message) errors.push(result.message);
    } catch {
      break; // Still offline; try again on the next "online" event.
    }
  }
  return { sent, errors, pending: readQueue().length };
}
