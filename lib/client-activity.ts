/**
 * Work in progress that a background refresh must not interrupt: preparing or
 * uploading a photo or video, or an editor with unsaved changes. Components
 * hold a token while busy; the /me and /coach refresh timers skip a tick while
 * any token is held, so a refresh never lands mid-edit and never replaces a
 * page that still holds unsaved work.
 */
const holders = new Set<symbol>();

export function holdRefresh(label = "busy") {
  const token = Symbol(label);
  holders.add(token);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders.delete(token);
  };
}

export const refreshHeld = () => holders.size > 0;

/** Asks the server who the cookies say we are. Never guesses on a failure. */
export async function sessionIdentity(): Promise<
  { state: "active"; userId?: string } | { state: "expired" } | { state: "unknown" }
> {
  try {
    const response = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401) return { state: "expired" };
    if (!response.ok) return { state: "unknown" };
    const body = (await response.json()) as { ok?: boolean; userId?: string; unknown?: boolean };
    if (body.unknown || !body.ok) return { state: "unknown" };
    return { state: "active", userId: body.userId };
  } catch {
    return { state: "unknown" };
  }
}
