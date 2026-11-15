# Operator setup for hosted subscription payments

Production must remain blocked until the operator supplies tax details and confirms
Paylink approval. This change does not set a VAT number or approve the provider.

## Migration

Apply `20261116160000_operator_tax_first_payment.sql` before deploying the app.
It reuses `public.ec_config` as the operator settings table and adds:

- `vat_number`: the operator's registration number; unset until supplied manually.
- `tax_configured`: a stored computed flag, false when registration settings are missing.
- `ec_accounts.billing_first_due_at`: stable period identity for direct purchase before any trial.
- Service-only `ec_billing_operator_config`, with no browser write permission.

Existing invoices, paid access, trial dates, and trainee ledgers are preserved.
The existing explicit `not_registered` operator tax treatment remains supported;
this migration does not select it or use it to bypass incomplete VAT registration.

## Values to enter manually in Vercel

| Variable | Value to supply |
| --- | --- |
| `VAT_NUMBER` | Actual operator registration number; leave unset until supplied |
| `VAT_RATE` | Actual percentage, entered explicitly; no default |
| `PAYLINK_VERIFIED` | Keep disabled until the operator manually confirms approval |
| `PAYMENTS_ENABLED` | Enable only when ready to accept payments |
| `PAYLINK_API_ID` | Merchant API ID for the selected environment |
| `PAYLINK_API_SECRET` | Merchant API secret; server only, never `NEXT_PUBLIC_` |
| `PAYLINK_WEBHOOK_SECRET` | Private shared token matching the Paylink webhook header |
| `PAYLINK_SANDBOX` | Select sandbox or live explicitly; live requires live credentials |
| `PAYLINK_BASE_URL` | Official host matching the selected environment; omit to select automatically |

Scoped `PAYLINK_SANDBOX_API_ID` / `PAYLINK_SANDBOX_API_SECRET` and
`PAYLINK_LIVE_API_ID` / `PAYLINK_LIVE_API_SECRET` override generic credentials.
Legacy `*_SECRET_KEY` names remain supported. Database server credentials and
`APP_URL=https://easycoach.space` must also be configured.

VAT environment values synchronize only the operator tax settings. They never
restore provider approval after an authentication failure. For explicit setup,
run with trusted server environment variables:

```sh
node --env-file-if-exists=.env.local --experimental-strip-types scripts/configure-operator.ts
```

Only after manually confirming approval and setting the corresponding environment
flag, append `--approve-provider` to record approval in the database. Redeploy after
changing Vercel environment variables. To disable immediately, disable the payment
environment flag; do not delete historical payment records.

## Payment behavior

Free trial onboarding is independent of paid billing after
`20261116200000_direct_free_trial.sql`. A new coach accepts the free trial during
registration and is enrolled once after verified email confirmation; Google
registration records the same explicit intent before OAuth. No phone, card,
merchant authentication or configured VAT is needed to explore the product.
Existing eligible accounts can start with one confirmation on `/start`.
The billing readiness gates still protect every paid invoice. An unknown tax
amount stays null during a trial; paid checkout uses the real operator tax
configuration once supplied. Trial enrollment never issues a paid invoice.

Legacy owners can voluntarily purchase a paid plan after migration
`20261116190000_voluntary_legacy_checkout.sql`. Pricing and subscription management
link to checkout rather than hiding purchases behind the legacy entitlement.
Checkout requires a separate explicit legacy transition checkbox in addition to
the current terms. SQL checks that consent and saves it in the invoice quote.
The account stays legacy until a matching provider-verified payment settles;
failed, pending or mismatched payments cannot withdraw legacy access. Only then
does it become managed, with the chosen plan limits and normal expiry rules.
Any existing trial end is preserved by the prepaid-trial settlement logic.

### Subscription coupons

Apply `20261116170000_subscription_coupons.sql` for checkout coupon support.
It creates the active code `anho` with a 99% discount on any paid plan, without
an expiry or usage cap. Codes are case-insensitive. The coupon applies to the
current invoice only and does not stack with campaign discounts; renewal keeps
the regular account price. Enter it in the coupon field on the payment form,
press Apply, and review the final total before paying.

The operator approved a minimum payable total of 5.00 SAR, matching Paylink's
minimum invoice amount. The UI discloses the floor when used: the 499.00 SAR
Pro plan becomes 5.00 SAR with `anho`, rather than 4.99 SAR. Business becomes
6.99 SAR when its regular price is 699.00 SAR. Tax, if configured, is recalculated
after the discount. Amounts and coupon validity are rechecked in SQL at invoice
creation and recorded in the invoice quote; client totals are never trusted.

Manage codes only from trusted SQL (not browser roles), for example:

```sql
update private.ec_coupons set enabled=false where code='anho';
```

A previously issued invoice keeps its agreed amount. Changing its coupon or
plan is blocked while it has a payment attempt; its Paylink payment URL must
not be repriced or replaced with a second payable invoice.

`POST /api/payments/paylink/create-invoice` reuses the authenticated platform
checkout handler. The server recalculates price and VAT; the client cannot set the
payable amount. For a test fixture with subtotal 499.00 SAR and a deliberately
configured 15% rate, VAT is 74.85 SAR and total is 573.85 SAR.

The Paylink Add Invoice `amount` is the final total, including tax. It is not
increased again. The user enters card details on Paylink; EasyCoach never collects
or saves a card. Each invoice covers a user-paid 30-day period.

The callback returns to `/subscription?payment=return&orderNumber=...`. The server
calls Get Invoice and checks transaction, order, currency, amount and status before
activation. Old callback URLs remain supported. A redirect alone does not activate
access. The webhook uses the same verification and idempotent database settlement.

In My Paylink, select webhook v2 and set the URL to:
`https://easycoach.space/api/payments/paylink/webhook`. Configure a custom header
`Authorization: Bearer <PAYLINK_WEBHOOK_SECRET>`; a URL alone is insufficient.
Paylink documents custom headers rather than a signed payload:
<https://developer.paylink.sa/docs/payment-webhook>.
Invoice API: <https://developer.paylink.sa/docs/add-invoice>.

When any readiness gate fails, payment/trial submit buttons are hidden and Arabic
reasons are shown. Starting an available trial grants Business features for 14
days without creating a paid invoice. Direct purchase is available separately.
Existing trials continue until their promised end. Migration
`20261116180000_prepay_during_trial.sql` allows an owner to pay during the trial:
the verified first paid period starts at the later of the provider payment time
and the promised trial end, and lasts 30 days from that start. Business trial
features continue until the trial ends, even when a lower paid plan is selected.
The paid invoice records the actual payment time separately from its service
period. Duplicate notifications never extend it. The UI shows the scheduled
start/end and blocks another purchase of the already-paid upcoming period.

## Operator not registered for VAT

Set `VAT_REGISTERED=false` and leave `VAT_NUMBER` / `VAT_RATE` unset. On the first
readiness check the app calls `ec_billing_operator_not_registered`, which moves an
**unconfigured** `ec_config` to `not_registered`: 499.00 SAR, VAT 0, no VAT line on
the confirm page, and no tax invoice. **The database wins on conflict**: if
`ec_config` already holds an explicit `exclusive`/`inclusive` setting, the environment
does not override it and the health check reports `environmentConflictDatabaseWins`.
`VAT_REGISTERED=false` together with `VAT_NUMBER` or `VAT_RATE` blocks payment.
If the sync fails (for example, the migration is not applied yet), payment stays blocked.

`PAYLINK_SANDBOX` defaults to sandbox when unset. With the live
`PAYLINK_BASE_URL=https://restapi.paylink.sa`, set `PAYLINK_SANDBOX=false`, otherwise
the merchant is treated as unconfigured and payment stays blocked.

## Health check

`GET /api/health/payments` with `Authorization: Bearer <CRON_SECRET>` (the same secret
the maintenance endpoints use), or a separate `PAYMENT_HEALTH_SECRET` for operator
diagnostics without rotating the cron secret. Other callers get a bare 404. Returns booleans only:

```sh
curl -s -H "Authorization: Bearer $CRON_SECRET" https://easycoach.space/api/health/payments
```

An authenticated `POST` to the same URL also requests a fresh Paylink API token
and returns `paylink.authenticationChecked` and `paylink.authenticationSucceeded`.
It never creates an invoice, charges a card, changes provider approval or returns
the token. `readyToCharge` describes configuration; authentication success alone
does not prove that a payment has settled.

## Payment log

`private.payment_events` records each verification: invoice id, status, expected and
provider amounts, source (`webhook`, `return`, `callback`, `cancel`, `checkout`),
Vercel request id and time. No secrets, card data or provider payloads. Webhook 401s
are counted in one row per hour. Run `docs/sql/payment-alerts-last-24h.sql` manually
to list 401s and failed or mismatched verifications in the last 24 hours.

## TikTok Subscribe

Queued by a database trigger only when an invoice becomes `paid` (after server
verification and amount match), unique per invoice, and delivered by the browser
pixel only after the server releases it. A return URL alone never produces it.
Follow-up after launch: also send it through the TikTok Events API from the server
with the same `event_id`.

## Rollback

Set `PAYMENTS_ENABLED=false` in Vercel Production and redeploy
(`vercel redeploy <production-url> --target production`, or Redeploy in the dashboard).
