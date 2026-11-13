# Recovery verification boundary

`tests/local-recovery.test.ts` is a reproducible, synthetic local PostgreSQL
recovery drill. It does not read `.env.local`, an existing data directory, a
hosted project, or any production backup.

Run it with:

```powershell
node node_modules/vitest/vitest.mjs run tests/local-recovery.test.ts
```

The test creates a fresh migrated database, inserts two fictional coaches and
one client/program, exports a compressed database archive, closes the source,
and restores the archive into a different PGlite instance. It verifies the
saved records, migration registry, ownership, anonymous read denial, and
cross-coach write denial after restoration. This is stronger evidence than
closing and reopening the same live directory.

The local drill does **not** establish any of the following:

- A current hosted Supabase backup or point-in-time recovery entitlement.
- Recovery of body-photo/video objects outside the PostgreSQL data directory.
- Recovery time or recovery point objectives under real production volume.
- Restoration into an independent hosted staging project.
- Successful rollback of a Vercel deployment after schema changes.

Before a production release, an authorized operator must verify backup
availability, restore into an isolated staging project, verify private object
storage and authorization, reconcile record/file counts, and record measured
recovery time. Rollback should first restore the previous application release
against compatible additive schema; it should not automatically drop columns
or tables. Destructive restoration or modifying existing production data is
outside this local test and requires a separately reviewed runbook.
