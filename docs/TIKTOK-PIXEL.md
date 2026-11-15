# TikTok Pixel

Set `NEXT_PUBLIC_TIKTOK_PIXEL_ID` in `.env.local` and Vercel Production, Preview, and Development. It is a public identifier, not a secret. A deployment/rebuild is required because Next.js embeds public variables into the browser bundle. An empty value renders no script and disables event claiming.

`components/TikTokPixel.tsx` mounts in the root layout and loads the provided official base code once through `next/script` with `afterInteractive`. The base code queues the initial PageView; subsequent pathname/query changes queue one additional `ttq.page()`, including navigation back. A stable script ID and document-wide route guard handle React remounts without duplicates.

`proxy.ts` captures only utm_source, utm_campaign, utm_content, and ttclid on the first page visit into `ec_first_touch`. This first-party cookie is HttpOnly, SameSite=Lax, Secure on HTTPS, and expires after 30 days without being extended or overwritten by later campaigns. An unattributed first visit remains unattributed during that period. Values are sanitized and bounded; other URL parameters are not stored.

Migration `20261116152000_tiktok_attribution_events.sql` adds:

- `ec_user_attribution`: immutable first-source values linked to the new Auth user. Email signup supplies them in Auth metadata; Google attaches them on its first successful callback. Existing users are not backfilled or reassigned on login.
- Private `ec_pixel_events`: one registration event per new user, and one Subscribe event per confirmed platform invoice. Subscribe requires the canonical invoice to remain Paid with a transaction reference and paidAt. URL parameters, free-trial activation, pending invoices, and redirects cannot create a Subscribe event.
- Private `ec_signup_pixel_receipts`: hashed, expiring random receipts so successful email account creation can be counted before email verification without accepting an arbitrary email/user ID from the browser. The receipt never authorizes login or payment. Google uses the authenticated session instead.

The protected same-origin POST `/api/analytics/events` derives the user from the verified session or opaque signup receipt. It atomically claims pending events, so repeat logins, callback replays, concurrent tabs, and reloads do not deliver a conversion twice. The browser sends only whitelisted event properties: CompleteRegistration has `content_name: 'EasyCoach signup'`; Subscribe has a generic content name, SAR currency and the verified invoice amount. No identify call, email, phone, card fields, user IDs, payment reference, or workout data is supplied as event properties.

Delivery is best effort and at most once: a claimed event is not retried across sessions if the browser closes or a tracker is blocked. There is no promise of receipt by TikTok in those cases. The external SDK handles PageView/device/browser data according to TikTok's own behavior. The privacy notice describes this integration. Analytics failures do not block signup, payment confirmation, or rendering.

Validation: `tests/tiktok-pixel.test.ts`, `tests/tiktok-attribution-proxy.test.ts`, `tests/tiktok-events.test.ts`, plus existing Google/signup/payment tests. `node scripts/qa-design-release.mjs qa-tiktok-browser.mjs` verifies base-code and SPA behavior, the first-touch cookie, registration once across reload, and no redirect-based Subscribe. It uses fictional accounts/pixel ID and intercepts TikTok network traffic; other browser suites disable the pixel entirely to avoid synthetic advertising conversions.
