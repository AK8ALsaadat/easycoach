# Coach identity

Settings → «هويتك أمام المتدربين» controls a separate trainee-facing display
name and coach portrait. Empty names fall back to the existing account name;
missing portraits use the bundled default. EasyCoach's existing brand stays.
The same identity is resolved by coach ownership for every linked trainee,
including `/me`, `/p/[token]`, `/invite/[token]`, and `/join/[token]`.
The portal's existing refresh also reloads identity; its PIN/session rules and
invitation/account verification rules are unchanged.

## Persistence and security

Apply `supabase/migrations/20261111133000_coach_branding.sql` before releasing
the application. It is additive and does not modify existing access functions
or trainee tables. `coach_branding` is an extension point for later branding
fields; logos and colors have deliberately not been implemented.

For this small portrait, server-processed JPEG bytes are persisted in the
database alongside the identity (maximum 250 KB after processing, 512×512).
No additional object-storage bucket, service credential, or upload reservation
is needed. This makes name and image replacement atomic and avoids orphaned
uploads. Files are decoded by sharp, orientation corrected, resized and stripped
of metadata. Maximum input is 5 MB / 40 megapixels; SVG and animated input are
rejected. Original files are never stored. Keep sharp as a direct dependency.

Only authenticated coaches can save their own identity, with ownership derived
from `auth.uid()` rather than a supplied coach ID. Trainees cannot edit it.
Table privileges are revoked and RLS is enabled. A version check rejects
concurrent stale saves. Authenticated snapshots include only the caller's own
coach identity and coaches of their active linked trainee records.

Coach name/portrait are **shareable branding**, unlike private body photos.
The settings copy explains this. A valid, unexpired portal/join/invitation
credential may resolve ONLY branding before authentication, for page headers
and share previews. No trainee details or portal proof are returned. Invalid,
revoked, consumed invitations, and archived-client links return no identity.
Images are served at a random revision UUID without embedding access tokens.
Replacement/removal deletes the previous image bytes immediately; its URL
returns 404. Responses use `no-store` and `nosniff`.

`APP_URL` must be the real HTTPS application origin for absolute Open Graph and
Twitter image URLs. Metadata contains coach branding and generic EasyCoach copy,
never trainee data, tokens, or private program details. Pages remain noindex
and use a no-referrer metadata policy. External social networks can retain
their own preview caches; this application cannot erase those cached copies.

## Verification

- `npm test`: database isolation, default values, account-name continuity,
  direct-table denial, trainee/anonymous write denial, stale updates,
  valid/invalid/expired/revoked/consumed links, original PIN enforcement,
  image sanitization, replacement/deletion and no trainee data in previews.
- `node scripts/coach-branding-browser-check.mjs`: run ONLY against an isolated
  local-mode database on port 3215 (override `TEST_BASE_URL` if necessary).
  Uses synthetic seeded accounts. Tests settings save/reload, real image
  responses, all three link types and OG metadata, `/me`, second-coach isolation,
  existing PIN access, mobile RTL overflow and deletion; screenshots go to
  ignored `artifacts/coach-branding/`. Never point it at production.

Focused simulated review (not real user research): a phone-based Arabic coach
led to stacked labeled controls and a visible portrait preview; a coach with
multiple trainees led to coach-owned identity instead of per-trainee copies;
a privacy-conscious trainee led to generic share metadata without trainee names;
a coach using two windows led to version-based conflict protection; a coach
with no custom identity led to explicit reset/default behavior. These cases are
covered by automated checks; browser visual verification must be reported
separately from automated database verification.

Delivery verification on 2026-11-11: production build, TypeScript and ESLint
passed. The full existing suite passed (112 tests at that point); the final
focused branding checks passed nine tests, including three server-action tests
using real PostgreSQL behind mocked request/cache adapters and a file-database
close/reopen persistence test. The branding migration alone was applied and
registered on the linked `easycoaching` production Supabase project. Read-only
SQL authorization assertions and anonymous REST requests confirmed RLS, schema
availability and no data from invalid credentials. No production trainee data
was changed, and unrelated pending migrations were not applied.

Browser verification was not performed: automatic approval review rejected
starting the loopback preview server as blocked by policy. The browser script
is supplied for the remaining visual/interaction verification. A Git push does
not constitute evidence that the application deployment has completed.
