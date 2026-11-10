# Trainee directory and demo access

The trainee page replaces the four-column board with an actionable directory. Four compact summary filters show all unarchived trainees, trainees needing attention, missing published programs and subscriptions that are expired or end within seven days. A zero count occupies a small summary card rather than an empty board column.

Each trainee appears once. Rows show the reason for follow-up, the latest recorded check-in, published or draft program state, a direct calorie-editor link, the latest recorded weight and change from the preceding measurement, and the latest subscription end date. Weight sparklines use up to eight actual measurements and neutral colors. Missing data is labelled explicitly. The interface does not equate an absence of alerts with verified adherence.

Priority sorting puts unread messages and pending check-ins first, then missing programs, renewals and other follow-up. Archived and inactive trainees do not enter action queues. Archived profiles show read-only details and a restore button rather than links to unavailable pages. Existing future renewals suppress obsolete renewal reminders. Search combines with filters; additional status filters remain available, and lists are paginated in groups of 20. Tablet and phone layouts turn rows into readable cards. The next action opens the relevant editor, follow-up panel or overview. WhatsApp and date-only renewal remain available per trainee.

The normal login form now recognizes the reserved `test` username and submits it through the existing demo-login server action. `test / test` also continues to work at `/demo`. This does not change real-account email validation, server-side password rules or registration requirements. A visible demo entry links directly to the dedicated page. The demo identity remains separate from coach accounts.

## Verification

- Unit coverage checks counts, inactive and archived exclusions, urgent-message priority, snapshot immutability, draft visibility, real versus future weights, existing renewals, search composition and stable sorting.
- TypeScript and ESLint checks, including a separate snapshot of staged source files.
- The isolated production browser harness checks normal and dedicated demo login, wrong demo passwords, synthetic tenant isolation, roster filtering, action destinations, pagination, mobile width and both themes, alongside existing client, exercise and subscription journeys.
- The existing hosted demo identity authenticated successfully against the configured auth service. Browser access to the hosted site encountered Vercel protection, so that check is not a claim that the deployed UI was verified.

No customer records, account passwords or backend schemas are changed by this UI update. Generated evidence stays under `.local-dev/continuous-lab/` and uses synthetic accounts.
