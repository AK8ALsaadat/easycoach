export const ATTRIBUTION_COOKIE = "ec_first_touch";
export const ATTRIBUTION_SECONDS = 30 * 24 * 60 * 60;
export type Attribution = Partial<Record<"utm_source" | "utm_campaign" | "utm_content" | "ttclid", string>>;
const limits = { utm_source: 64, utm_campaign: 120, utm_content: 120, ttclid: 255 } as const;
export function cleanAttribution(input: unknown): Attribution {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Attribution = {};
  for (const key of Object.keys(limits) as (keyof Attribution)[]) {
    const raw = (input as Record<string,unknown>)[key];
    if (typeof raw !== "string") continue;
    const value = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0,limits[key]);
    if (value && (key !== "ttclid" || /^[A-Za-z0-9_-]+$/.test(value))) result[key]=value;
  }
  return result;
}
export function attributionFromUrl(params: URLSearchParams) { return cleanAttribution(Object.fromEntries(params)); }
export function attributionCookieValue(input: Attribution) { return encodeURIComponent(JSON.stringify(cleanAttribution(input))); }
export function readAttributionCookie(value: string | undefined): Attribution {
  try { return value && value.length<=3500 ? cleanAttribution(JSON.parse(decodeURIComponent(value))) : {}; } catch { return {}; }
}
