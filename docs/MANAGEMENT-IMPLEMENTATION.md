# EasyCoach — implementation and verification

Date: 8 November 2026. Baseline: `d31ecff`. The [baseline audit](PLATFORM-AUDIT.md) was recorded before implementation. [Import/export contract](IMPORT-EXPORT.md) describes supported formats and exceptions.

## Delivered behavior

| Area | Implemented behavior |
| --- | --- |
| Client management | Birth date or age, gender, height, start date and lifecycle status; roster search, sorting and active/inactive/new/renewal/check-in/adherence/stall/archive filters; reversible archive and restore. Account display-name editing. |
| Templates | Existing builder retained; description, type, duplicate, archive, delete and multi-client assignment. Each assignment copies content to an independent draft. Replacing drafts and publishing require explicit choices. Nutrition templates replace nutrition only. |
| Programming | Load, RPE, RIR, tempo, weekday and notes, plus existing sets/reps/rest/media. Ready 3/4/5/6-day splits. Published copies and client drafts remain independent. |
| Historical coaching | Immutable dated measurements, custom measurements, nutrition targets/actuals, workout completion and performance, goals, check-ins, private notes and messages. Corrections append records; legacy daily-weight corrections retain previous values. |
| Progress | Interactive weekly/monthly/full-history charts, date ranges, comparison and target; weight, body fat, circumferences, BMI and recorded exercise loads. Explicit recorded BMI is retained; calculated BMI uses the currently saved height. |
| Nutrition | Effective dated targets, daily actual-versus-target comparison, meal plans and scheduling from the existing builder, reusable nutrition templates and target history. Updated targets appear in the trainee program without changing the stored published workout snapshot. |
| Weekly review | Client submission of weight, wellbeing ratings, adherence, feedback/questions and references to private photos; coach feedback/review status and previous-week comparison. Works for linked accounts and PIN portals. |
| Communication | Persistent internal messages, author/read state, client submission alerts, configurable in-app weight/check-in/workout reminders, subscription tasks and evidence-based low-adherence/stall alerts. Inactive clients are excluded from coaching follow-up tasks. |
| Import/export | All worksheets, Arabic/English mapping, custom measurements, dated records, explicit conflict handling, atomic imports, source-key replay protection, downloadable error reports and guarded undo. Real multi-sheet XLSX export plus existing JSON/CSV. |
| Interface | Existing light portal, IBM Plex Arabic and shared Lucide SVG system retained; native Arabic RTL/English LTR switch, localized labels/dates/currency and exercise instructions, responsive client hub and paginated history/library/preview. User-entered names and notes retain their original language. |
| Privacy | Coach-only notes, tenant-scoped data, private progress photos, checked upload/finalization, short-lived access URLs, and queued retryable file erasure after an explicit privacy deletion request. The privacy notice now describes the actual new data categories. |

## Database changes

Additive migrations:

- `20261107145844_management_system.sql`: `client_details`, `coaching_records`, `template_metadata`, `import_batches`, `account_preferences`, `progress_photos`, `import_subscription_refs`; historical validators, indexes, checked management/portal RPCs and private storage bucket. Archive no longer deletes weight/goal history; explicit privacy deletion still erases coaching data.
- `20261107160711_management_privacy_cleanup.sql`: private storage-erasure queue, scoped retry/profile functions, explicit hosted grants, mapped-contact merge protection, and temporary staging of undo changes to avoid repeated JSON copies.
- `20261108033525_management_import_validation.sql`: parameterized statements for transaction-local import staging. Static validation of this function requires a temporary table fixture; no persistent staging table is introduced.
- `20261108034750_nutrition_assignment_safety.sql`: nutrition-only assignment preserves the existing program name/days and rejects a missing base program, preventing placeholder exercise publication. Standalone targets remain available in the client hub.

Writer operations check identity and ownership. The `coach_api` role does not bypass RLS. Direct authenticated table writes are revoked; trainer notes have a separate client-read exclusion. Portal writes validate token/PIN proof, client identity, allowed record kind, published program ownership and photo ownership. Review/read fields may change; historical payloads may not.

Progress photographs use a private `progress-photos` bucket. Local QA uses protected files in ignored `data/`. A storage failure leaves an erasure job that can be retried from Settings; metadata removal immediately removes route access. Existing shared exercise demonstration videos are not deleted with one client.

Hosted migrations preserve existing business rows. The pre-migration check found 9 clients, 9 programs and 2 ledger entries; the post-migration check found the same counts and zero new coaching records. No fictional business data was inserted into the hosted project.

## Verification scope

See [executed test report](MANAGEMENT-TESTING.md). Assertions are based on executed database/browser tests, not the existence of buttons. Full account history is still loaded as a tenant-scoped snapshot; indexes and UI pagination support the tested roster, but long-running large accounts need server-side query pagination in the next phase.

## Remaining work and limits

- 874 of 876 exercise entries still lack an exactly matched commercially licensed anatomical asset. The two licensed matches remain available; all others show the explicit neutral fallback. No guessed pose or copied Hevy artwork was introduced. See [media coverage](exercise-media-coverage.json).
- Historical workbook migration supports the documented coaching categories. Linked renewals, ledger reversals and cross-account photo binaries/identities require a dedicated reconciliation process. Unsupported relationships fail explicitly instead of being converted into ordinary records. XLSX is not a full database-backup restore; retain the complete JSON export as well.
- Reminders are computed inside the app when opened. No background email, WhatsApp, SMS provider, scheduler or push delivery was added. These require separate infrastructure and a defined delivery policy.
- Hosted browser auditing is blocked by the deployment's Vercel SSO protection. This protection was kept enabled. Real registration email delivery and hosted signed-photo upload were not claimed as verified end-to-end.
- Supabase security advisors reported the existing disabled leaked-password protection setting. No plan, billing or external service settings were changed as part of this task.
- Dependency audit found no runtime findings and eight moderate development-tool findings in the ESLint chain. The suggested force fix changes the Next.js ESLint configuration major version and was left for a separately validated toolchain update.
- Workout history records session-level exercise performance, not a separate timestamped row for every individual set. Imported dates use calendar-day precision. Calculated historical BMI uses saved profile height unless the original BMI was supplied.
- Native interface translation is bundled locally; user-entered program names, notes and instructions are not automatically translated. Long-tail provider error wording may require further editorial review.

Next phase: acquire exact licensed media coverage, add server-side history pagination and measured hosted load testing, then implement reconciled financial/photo backup restoration and scheduled notification delivery.
