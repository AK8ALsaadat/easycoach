# Demo account

The user explicitly requested a shared testing identity after the platform implementation. `/demo` accepts username **test** and password **test**. The authenticated profile is named **test** and has its own trainer tenant; three clearly fictional clients were provisioned there. Existing trainer accounts and their records were not modified.

The short credentials are accepted only by the dedicated demo form. The server signs in to the reserved `test@demo.easycoach.test` identity with a separately generated strong credential from `DEMO_AUTH_PASSWORD`; normal login validation and Supabase password policy are unchanged. The route verifies the server-owned `app_metadata.demo` marker. Tenant reads/writes use the same authenticated RLS RPCs as other accounts; the demo route does not return service keys or use administrator reads for coaching data.

This is a shared writable demo, so changes are visible to anyone using its public credentials. Its workspace displays a notice to keep real client information out. In local mode, a separate persistent demo identity is provisioned in the local database. It does not reuse the default preview coach's records.

Provisioning is idempotent and refuses to modify a pre-existing non-demo identity at the reserved email. `scripts/provision-demo.mjs` requires the exact `--project-ref`, takes server credentials from environment or `--env-json`, and optionally configures the sensitive production variable with `--configure-vercel`. Private generated credentials stay in ignored `.vercel/demo-account.private.json`. Never commit that file.

Vercel's existing deployment protection is independent of application login and remains enabled. A testing agent encountering Vercel SSO needs access to that deployment before it can reach `/demo`; `test/test` does not bypass hosting protection.

Verification: the real Supabase demo session read only its three seeded clients. Automated database tests reject wrong credentials/markers and cross-tenant writes. Browser QA covers dedicated login, ordinary CRUD, persistence, isolation, the demo banner, Arabic/mobile and English.
