# Executed test report — 8 November 2026

Environment: optimized Next.js production build served locally, real PGlite PostgreSQL-compatible database and RLS, Edge/Playwright on Windows. Fictional identities and fixtures stay in the local/in-memory test environments. Supabase hosted checks below use schema metadata and row counts; they do not insert fictional business records.

## Functional and data-integrity checks

`npm test -- --reporter=json --outputFile=artifacts/management-tests.json`: **65 passed, 0 failed**, across four suites. Of these, 27 are management-system tests. The report file contains individual executed assertion names and timings.

| Test | Expected | Actual | Status |
| --- | --- | --- | --- |
| Create/edit clients | Persistent scoped identity and typed demographics | 50 fictional clients created; demographic values verified; an omitted phone column survives merge | Passed |
| Durable database | Records survive close/reopen | File-backed database reopened and original client read back | Passed |
| Tenant isolation | Other trainer cannot read/write private clients | RPC and direct-table boundaries rejected unauthorized access | Passed |
| Trainer-private notes | Not present in trainee reads, export or PIN portal | Backend checks and trainee browser verified exclusion | Passed |
| Template lifecycle | Save, metadata, duplicate, archive/delete; preserve copies | Database tests verify metadata and atomic failures; nutrition-only assignment preserves the program name/days and rejects a missing base program | Passed |
| Assign template to five clients | Independent programs | Five copied drafts verified; changing original does not change assigned copies | Passed |
| Individual program changes | Only selected client changes | Existing core/studio draft, copy and publish tests pass | Passed |
| Historical measurements | Corrections retain earlier values/dates | Original dates and historical correction records verified | Passed |
| Archive/restore | Disable access and retain history | Regression found old weight/goal deletion; fixed; archive and restore now verified | Passed |
| Nutrition history | Dated target and actual records | Stored macro values and target history verified; old imported targets do not override a more recent published plan | Passed |
| Workout history | Multiple exercises and prescriptions retained | Grouping, loads/RPE/RIR, completion and program ownership verified | Passed |
| Weekly check-in | Client submits, trainer reviews | Stored ratings, feedback, review status and PIN boundaries verified | Passed |
| Messages | Correct author/read state | Coach/client records and read markers persisted | Passed |
| Multi-sheet migration | Every mapped historical row preserved | Arabic/English fixture imports January 90 kg, February 87 kg, March 85 kg, custom measurements, macros and workout/program rows | Passed |
| Complete single-row migration | Mixed fields create dated records | Demographics, measurement, macro, goal, note and program fields verified | Passed |
| Repeated import | No unintended duplication | Source keys and batch fingerprints tested | Passed |
| Conflicting source key | Reject changed payload/date | Transaction rejected and original value retained | Passed |
| Failed batch | No partial writes | Explicit invalid/unknown client and database-failure cases rolled back | Passed |
| Undo | Only unchanged import data is removed/restored | Exact-row checks, newer activity and manual edits prevent unsafe undo | Passed |
| XLSX export/re-import | Supported coaching payloads match source | Real workbook exported and imported into a second fictional trainer; historical payloads/dates/source keys reconciled | Passed |
| Large import | 10,000 accepted rows actually stored | Stored database count equals 10,000, not just preview count | Passed |
| Invalid nested/raw RPC data | Reject forged exercises/meals/ratings/photos | Negative/range/fractional/foreign ownership cases rejected | Passed |
| Privacy erasure | Coaching rows disappear; private file work remains retryable | Metadata/records/weights erased; owner-only deletion queue and acknowledgment verified | Passed |
| Account update | Only caller display name changes | Anonymous update rejected; role unchanged | Passed |
| Alerts | Evidence-based, configurable, inactive-aware | Recorded low adherence and inactivity/preferences tested | Passed |
| Existing auth/finance/media | Original workflows continue | Core and studio suites all pass | Passed |

The large import initially exposed repeated JSON-copy overhead and exceeded the test timeout. Temporary transaction-local staging removed that bottleneck. The final executed test, including merge/preview/import checks, completed in approximately 8 seconds on this machine; this is not a hosted throughput guarantee.

## Browser checks

| Script | Executed scope | Status |
| --- | --- | --- |
| `scripts/management-browser-check.mjs` | Workbook UI import of 50 clients with ten scenario types; 33 historical measurements, nutrition/goals, wellbeing/adherence check-ins, grouped exercise logs and an expiring subscription. Status filter, five-client template assignment, dated/custom measurement save, private note exclusion, trainee check-in, trainer feedback, message, offline failure with retained unsent text, private image upload, anonymous rejection and persistent reload. English LTR at 390/768/1440 px; Arabic trainee at 390 px. No page errors or horizontal page overflow. | Passed |
| `scripts/browser-check.mjs` | Real local sign-in, client creation, persistent draft reload, publish, subscription dates, partial payment, freeze replay, invite generation, tenant isolation, multi-row CSV import and mobile layout. Column mapping selector updated to the new UI. | Passed |
| `scripts/studio-browser-check.mjs` | Protected video upload, mobile QR workflow, meal editor, publish, live PIN portal, weight correction, responsive layouts and anatomical image authorization. | Passed |
| `scripts/portal-browser-check.mjs` | Exercise media/fallback, search, filters, tabs, state preservation and five pages at 360/390/768/1280/1920 px without changing account data. | Passed |

Screenshots and machine-readable results are under ignored `artifacts/management-ui`, `artifacts/screenshots`, `artifacts/studio` and `artifacts/portal-v2`. Screenshots were visually inspected; actual stored records were queried as well.

## Build and hosted checks

| Check | Actual result | Status |
| --- | --- | --- |
| ESLint | Zero errors in final feature build | Passed |
| TypeScript / production build | Next.js compile, type validation and route generation completed | Passed |
| Supabase migrations | Four additive migrations applied to `trlgsugychocgwtnmzej`; generated public database types refreshed | Passed |
| Existing hosted business rows | 9 clients, 9 programs, 2 ledger entries before/after; zero new coaching records | Passed |
| Photo bucket | `progress-photos.public = false` | Passed |
| Security advisors | No error-level findings; one existing warning: leaked-password protection disabled | Passed with existing warning |
| Unassisted CLI SQL lint | Import staging relation absent outside the function's transaction; tool reports `42P01` for its temporary table | Blocked by static-checker context |
| Import SQL validation with fixture | `scripts/check-import-function.sql` supplies the exact temporary table, asserts zero error-level findings, rolls the whole check back, and returns a success flag | Passed |
| Hosted browser navigation | Production URL returns HTTP 302 to Vercel SSO | Blocked |
| Real email registration/delivery | Requires an accessible hosted flow and the configured email service | Not tested |
| Hosted signed-photo upload | Local protected upload/finalization passed; hosted end-to-end upload not exercised | Not tested |
| Scheduled external notification delivery | No scheduler/provider configured or introduced | Not implemented |

The temporary-table limitation and fixture approach are described by the [plpgsql_check project](https://github.com/okbob/plpgsql_check#temporary-tables). The fixture does not disable checking and leaves no persistent test objects.

## Resolved failures and remaining risk

Resolved: PIN record SQL ambiguity, missing SQL column after parameter rename, mistaken mixed-sheet classification, row grouping, archival deletion of history, unmapped phone overwrite, source-key collision skipping, import undo metadata checks, oversized batch refusal, historical correction retention, and quadratic import-change accumulation. Browser selector failures were corrected when the mapping UI and check-in badge changed.

Remaining limits: exact anatomical media coverage, full financial/photo backup restoration, provider delivery, per-set workout analytics, server-side history pagination for long-running accounts, and independent production browser/load testing. See [implementation and limitations](MANAGEMENT-IMPLEMENTATION.md) and [format contract](IMPORT-EXPORT.md).
