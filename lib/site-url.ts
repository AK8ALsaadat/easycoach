/** Only a configured HTTP(S) origin enters canonical and crawler metadata. */
export function siteUrl() {
  try {
    const url = new URL(process.env.APP_URL ?? "https://easycoach.space");
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid origin");
    return new URL(url.origin);
  } catch { return new URL("https://easycoach.space"); }
}
