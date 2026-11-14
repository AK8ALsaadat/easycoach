/** Recognised third-party video links the coach can paste into an exercise. */
export type EmbeddedVideo = { kind: "youtube"; id: string; thumbnail: string; embed: string; watch: string };

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);

/**
 * Parses a YouTube link into the pieces a player needs. Returns null for
 * anything else, including a plain file link, which stays an ordinary link.
 */
export function embeddedVideo(url: string): EmbeddedVideo | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !YOUTUBE_HOSTS.has(parsed.hostname)) return null;
  const id = parsed.hostname.endsWith("youtu.be")
    ? parsed.pathname.slice(1)
    : parsed.pathname === "/watch"
      ? (parsed.searchParams.get("v") ?? "")
      : /^\/(embed|shorts|live)\//.test(parsed.pathname)
        ? parsed.pathname.split("/")[2]
        : "";
  if (!/^[\w-]{11}$/.test(id)) return null;
  const start = Number(parsed.searchParams.get("t") ?? parsed.searchParams.get("start") ?? 0);
  const from = Number.isFinite(start) && start > 0 ? `?start=${Math.floor(start)}` : "";
  return {
    kind: "youtube",
    id,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    // nocookie + no autoplay: nothing loads from YouTube until the coach or
    // trainee asks for it by clicking the thumbnail.
    embed: `https://www.youtube-nocookie.com/embed/${id}${from}`,
    watch: `https://www.youtube.com/watch?v=${id}`,
  };
}

/** mm:ss, or h:mm:ss past an hour. Western digits, like the rest of the UI. */
export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}
