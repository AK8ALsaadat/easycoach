# Card-less subscription lifecycle

Apply `20261116150000_subscription_lifecycle.sql` before deploying the application. It is additive: existing coach/trainee records, other plans, and legacy-account privileges are preserved. Professional remains 499.00 SAR per 30-day period; trials grant Business features for exactly 336 hours.

New database fields and tables:

- Enum `ec_subscription_state`: NOT_STARTED, TRIAL_ACTIVE, TRIAL_ENDING, AWAITING_PAYMENT, ACTIVE, PAST_DUE, SUSPENDED, CANCELLED, PAYMENT_FAILED, PROVIDER_NOT_READY, TAX_NOT_CONFIGURED.
- `ec_accounts`: `lifecycle_enabled`, `subscription_state`, `billing_block`, `billing_payment_failed`, `billing_mobile`, `billing_name`, `billing_checked_at`, `cancelled_at`. Existing `trial_start`, `trial_end`, `period_start`, and `period_end` remain the authoritative startedAt/trialEndsAt/paymentDate/paidUntil timestamps. No payment-method reference is created by the new flow.
- `ec_invoices.due_at`: one canonical invoice per owner and period, enforced by a unique index. Existing amount/status/paid_at remain the invoice audit ledger.
- Private `ec_payment_attempts`: attempt/invoice IDs, unique merchant order and transaction IDs, amount in halalas, local status, raw provider status, sanitized payment errors, hosted URL, paidAt/verifiedAt/createdAt. Historical attempts are retained when a link expires.
- `ec_billing_notifications`: owner-scoped in-app reminders, unique per owner/kind/Riyadh calendar day. Reminders appear on the subscription page; the coach workspace also shows the trial-ending banner. No email delivery is implied.

Environment variables:

- `PAYMENTS_ENABLED=false` by default. Starting a trial and creating invoices both require true, verified Paylink, and configured tax. Previously issued payments can still be verified while issuance is disabled.
- `PAYLINK_SANDBOX=true|false` selects `PAYLINK_SANDBOX_API_ID` / `PAYLINK_SANDBOX_SECRET_KEY` or `PAYLINK_LIVE_API_ID` / `PAYLINK_LIVE_SECRET_KEY`. No cross-environment fallback. Existing generic `PAYLINK_API_ID` / `PAYLINK_SECRET_KEY` remain aliases only on the matching selected host.
- Optional `PAYLINK_BASE_URL` must match the selected official host; loopback is allowed only in local development. `PAYLINK_WEBHOOK_SECRET`, `APP_URL`, and existing service-role credentials are still required.
- `CRON_SECRET` must match the GitHub repository secret. The public repository's `.github/workflows/subscriptions-hourly.yml` invokes the protected maintenance endpoint hourly without a paid Vercel plan. Keep the existing daily Vercel job as a fallback. GitHub scheduled workflows can be delayed; access checks independently use database time, not cron punctuality.

Operator configuration remains explicit in `ec_config.provider_verified`, `tax_mode`, and `tax_bps`. Empty tax displays **بانتظار ضبط الضريبة** and blocks both trial activation and paid invoice creation. Auth/permission errors remove provider verification and generate a safe operator log; user messages never expose provider responses or keys.

Start requires confirmation, policy acceptance, a Saudi billing mobile, provider authentication, and the gates above. Each paid period ends at verified provider payment date + 30 days. If the provider omits an unambiguous timezone-qualified payment timestamp, verification time is used. Early renewal starts a new 30-day period on the payment date, as disclosed in the UI; it does not append 30 days to the old end date.

Renewal invoices are generated five days before paidUntil; trial invoices at trial end. A three-day grace retains the previous tier (Business after a trial, Professional after its paid period), then access returns to Free with all data retained. Explicit cancellation preserves only the already-granted period, disables future invoice jobs, and never initiates a charge. A payment arriving after cancellation is held for review rather than silently restarting the subscription.

Paylink pending invoices expire after about 24 hours. Declined cards usually leave the invoice Pending with errors. Reuse the same payable attempt until Get Invoice confirms cancellation; then create a new attempt for the same period. A lost create response stays reserved and can be recovered by an authenticated webhook carrying the order/transaction. Do not blindly retry uncertain creations. Webhook/callback verification compares the merchant order, transaction, exact amount and SAR before activation; replays cannot extend access twice.

`ec_reconcile` persists time transitions and queues daily reminders. Invoice jobs are bounded and rotate by last check to avoid starving later accounts. All entitlement checks remain server-side. The old browser trial/reservation RPCs are retired so they cannot bypass the environment flag. Service-only lifecycle mutations are not exposed to browsers. Historical migration rollback refuses to discard consent or invoice evidence.

Validation: lifecycle transition tests, readiness/environment tests, real webhook-handler tests against PostgreSQL-compatible PGlite, trial-consent/RLS tests, and the synthetic browser suite. No real card or charge is required for these tests.
