Temporarily free platform
=========================

`BILLING_ENABLED=false` is the single switch. It defaults to false when absent.
Set it in the server environment, then restart locally or redeploy on Vercel.
No `NEXT_PUBLIC_` billing variable is needed: the root layout passes the server
value through `BillingModeProvider`.

Free mode hides commercial pages, links, notices, financial client panels,
financial reports, import categories and export sheets. Old direct commercial
URLs redirect home, and payment API endpoints return 404. Verified signup opens
the workspace directly without enrolling the account in a trial.

The root layout and authenticated RPC boundary mirror the environment flag into
`private.ec_runtime_flags` using `ec_billing_runtime(boolean)`. Only the service
role can execute that function; a browser cannot choose its own entitlements.
The private row is an implementation mirror, not an independently configured
switch. The migration starts it disabled. Apply migrations before deployment.

SQL guards grant existing coach accounts all Business features without client,
template or team-seat quotas. Authentication, tenant isolation, invitations,
manual archiving, consent and input validation still apply. No account status,
period, consent, invoice, price or existing commercial setting is rewritten.
The SQL cron invocation, reconciliation, expiry automation and renewal queues
skip billing work. Outbox delivery is not implemented in this repository.

To restore commercial behavior, set **only `BILLING_ENABLED=true`** and redeploy.
The next page/RPC request updates the SQL mirror. Existing payment-provider,
tax and campaign checks then apply exactly as configured previously; their
credentials and settings are retained. The cron schedule remains installed and
resumes through the same guards.

Validation:

- `npm run build`
- `npm test` (existing regression fixtures explicitly enable billing)
- `npx vitest run tests/free-platform.test.ts`
- `node --experimental-strip-types scripts/qa-free-platform.mjs`

The browser check uses a synthetic isolated database and tests login, expired
coach access, trainee access, commercial text/links, direct payment routes,
scheduler behavior and mobile/desktop console errors. It creates no production
users, messages or payment requests.

The repository intentionally retains commercial code and SQL history behind
the flag. Text-search matches in those files are expected. Nutritional
«سعرات/سعرة», exercise «دفع», and import batches are unrelated to commerce.
