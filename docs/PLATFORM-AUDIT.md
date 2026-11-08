# EasyCoach — baseline audit and implementation plan

Audit date: 7 November 2026. Baseline commit: `d31ecff`.

This report is written before feature implementation. Source inspection is evidence of implementation, not proof that a workflow passes. Existing regression results from the earlier redesign are historical; the expanded system will have a separate executed test report.

| Area | Existing implementation | Gap / risk | Priority |
| --- | --- | --- | --- |
| Authentication | Supabase verified identities, protected Server Actions, local fictional accounts | Hosted deployment protection may prevent browser audit; registration email delivery requires the mail service | P0 |
| Tenant isolation | Non-BYPASSRLS writer role, private RPC implementations, per-coach RLS | New records must preserve this contract; no admin reads for trainer data | P0 |
| Clients | Name, email, phone, archive, invitations and links | No birth date, height, gender, lifecycle status or broader fitness profile | P0 |
| Templates | Save, edit, copy and independent JSON snapshots already exist | Missing descriptions, archive/delete, bulk assignment, load/RPE/RIR/tempo and weekly scheduling | P0 |
| Import | CSV/XLSX parsing, preview, mapping, basic duplicates, atomic basic client import | First worksheet only; maps name/email/phone only; no historical migration, report download or undo | P0 |
| Export | Tenant-scoped JSON and basic CSV | No complete multi-sheet XLSX or documented round trip | P0 |
| Workout programs | Per-client draft, autosave, publish, nutrition and media | No completion or set-performance history | P1 |
| Nutrition | Targets, meals and independent published snapshots | No daily actual macros, historical targets or adherence comparison | P1 |
| Progress | One corrected weight per day and chart | No body measurements, BMI by recorded height, date comparisons or strength trends | P1 |
| Check-ins | None | Need client submission, weekly dates, wellbeing ratings, review and feedback | P1 |
| Communication | Manually opened WhatsApp drafts | No internal conversation history, configurable in-app reminders or unread tracking | P2 |
| Dashboard | Program readiness, balances and subscription tasks | Cannot infer adherence/stalls from missing data; needs actionable evidence from actual records | P2 |
| Exercise images | Two exactly matched licensed 3D assets and explicit neutral fallback | 874 catalog entries still lack licensed matching media; no invented substitutes | Known limitation |
| Language | Arabic RTL and English exercise search | Full interface English LTR is absent | P1 |
| Performance | Whole account snapshot and locally paginated exercise catalog | Full history and larger rosters need bounded queries/indexes; catalog JSON is large | P1 |

## Development plan

1. Preserve all current APIs and deployed migrations. Add constrained, tenant-scoped personal details and historical coaching records, plus template metadata and import batches. Reuse weights, programs and templates rather than duplicating them.
2. Extend workout configuration and template lifecycle. Add explicit multi-client assignment that copies content into separate drafts and never changes already published programs implicitly.
3. Upgrade import to all worksheets, Arabic/English field mapping, typed records, historical dates, per-row errors and explicit conflicts. Import in one database transaction, use stable source keys for idempotency, and provide undo for unchanged imported data. Add multi-sheet XLSX export and format documentation.
4. Add real client/coach screens for personal information, measurements, macro logs, workout completion, notes, check-ins, review, messages and reminders. Show historical records and comparisons; do not turn absence of data into a claim of poor adherence.
5. Add an actionable daily queue and status filters, nutrition template reuse, and language preferences. No third-party messaging, paid service or medical recommendation is introduced without its actual requirements being satisfied.
6. Test in a fictional environment with at least ten varied clients (and a 50-client roster), including duplicate import, rollback, source-to-database reconciliation, template independence, cross-tenant rejection, client permissions and existing regressions. Record actual results, failures, blockers and untested scope separately.

## Safety and compatibility rules

Historical records retain their original dates; corrections are explicit. Coach-private notes never appear in client exports or PIN portals. Import cannot silently publish a program, replace a current draft or overwrite a payment ledger. Destructive template actions require confirmation; archive preserves existing assigned copies. Existing access protection remains enabled. No fictional clients are inserted into production business accounts.
