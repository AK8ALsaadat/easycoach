# QA continuation — 14 November 2026

Continues the uncommitted EasyCoach QA changes left by Claude. This report distinguishes implemented changes from the larger original QA wish list.

## Identity and session diagnosis

- All coach routes and the sidebar already use the same `management_snapshot`; React `cache()` is scoped to a server request, not shared across users. No evidence establishes a cross-user React cache leak.
- The server previously constructed separate Supabase clients for RPC calls within a request. It now reuses one request-scoped client, reducing competing refresh attempts. This is a plausible refresh failure mechanism, not proof of the original production incident.
- A signed-in notice makes account replacement explicit on the login page. `/api/session` returns a private, uncached identity check; the session guard displays expiration or identity changes without navigating away from the editor.
- Background trainee refresh checks the identity and pauses during photo/video processing and unsaved program changes. Coach-only actions throw an expiration error before invoking a redirecting page snapshot.
- Production inspection found no duplicate normalized profile email addresses. The additive migration serializes profile creation per email and blocks a second profile. No account merge was necessary or performed.

## Changes

- Independent per-angle photo preparation, per-angle errors, local error boundary, and latest-selection-wins behavior. Choosing a replacement remains possible while its earlier selection processes.
- Empty training days save in drafts and block publication with named-day feedback. Days can be reordered and deleted, with confirmation for populated days. Draft saves stay in the editor, show feedback, and retain autosave and revision conflict protection.
- Upload size raised to 200 MiB in API validation, database constraints, local upload handling and the private Storage bucket. Large hosted uploads use signed TUS chunks with automatic offset-based retries. Small/local uploads keep direct PUT. Original bytes are preserved.
- Upload verification has a separate visible state and a retry that does not re-upload the stored file. Playback reads metadata, follows video proportions and exposes fullscreen. YouTube links have a thumbnail and inline player.
- Custom exercises support uploaded media, QR upload, deletion and cleared forms after save. Guide/search entries carry uploaded media and coach instructions into program rows, including when selected by name.
- Bulk assignment supports package/status filters, checkboxes and draft replacement counts.
- The weekly review button opens the existing real trainee check-in form; record submission/reply and coach review queues continue to use the existing database workflow.
- Payment CTA is clearer, duplicate renewal wording removed, empty meals hidden, installation dismissal expires after a week, update notices are smaller, exercise notes span the editor width, and draft save status is visible.
- All 876 exercise names now have Arabic labels, with 163 explicit movement names and 713 generated from the terminology lexicon. Original English names remain available. Added English translations for new UI messages.

## Production database work

Applied five pending migrations, including the previously committed Paylink reservation migration and the four QA migrations `20261114140000` through `20261114170000`.

Moved only the specified QA template, custom exercise and two uploaded media records from `khutwa` to `abdulaziz alsaadat` (the coach with 42 trainees). Verified all four records now belong to the target coach. No records were deleted. The template metadata foreign key was deferred only inside the transaction, validated, then restored to its original nondeferrable form. Media IDs and object paths remain unchanged, preserving references.

## Verification

- Full Vitest run: 58 files, 391 tests passed. The subsequently added resumable upload integration test also passed, bringing coverage to 392 tests across 59 files.
- The TUS integration test sends 13 MiB through a local HTTP endpoint, deliberately fails a chunk, verifies HEAD/offset recovery, the scoped signature, chunk size and byte-for-byte output.
- `npm run typecheck` and `npm run lint` passed.
- `npm run build -- --webpack` passed. The initial Turbopack attempt was stopped after repeated Google Fonts fetch timeouts; Webpack completed with the real font configuration.
- `npm run test:ui` passed: local auth, coach isolation, browser import, durable draft reload, publication, subscription dates, freeze replay, invitation generation, trainee access and mobile layout.
- `node scripts/qa-session-photos.mjs` passed: A then B in the same context across five coach routes; three rapid photo selections; replacing a slow photo; 390px layout without horizontal overflow; session loss retains `/me` and photo previews behind the sign-in modal. This is local synthetic data, not a production account test.

## Remaining original QA requests / limits

This delivery does **not** certify every item in the original request:

- No real iPhone/HEIC or 60 MB QR upload acceptance run. Signed TUS behavior is integrated, but the hosted Storage path still needs a real-device end-to-end upload check.
- No server video transcoding worker or generated poster asset. Uploaded originals retain their quality; metadata/first-frame playback is not a generated 1080p rendition or persistent poster.
- No measured production guarantee that desktop verification finishes within five seconds.
- Empty days save, but arbitrary invalid exercise numbers and missing exercise names still fail validation; a completely permissive unfinished-exercise draft format needs a separate schema/editor change.
- The existing trainee bottom navigation still scrolls between sections. Dedicated focused screens, workout execution/set logging/rest timer, unified localized date inputs and the proposed upcoming-check-in calendar are not implemented here.
- Reauthentication preserves the mounted page; explicit reload/navigation still requires saving or copying unsaved work first. This is not a persistent recovery store.
- Arabic names generated from the lexicon need a qualified coach's editorial review, especially unusual movements.
- Real Paylink payment and real cross-device token-refresh behavior were not exercised.

TUS implementation reference: [Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).
