# Private progress-photo cleanup

`deleteProgressPhoto` first removes the authorized photo record, then immediately
tries to remove its file for coach, linked-account and portal-session callers.
The private deletion queue retains failed work. The UI distinguishes complete
physical deletion from an inaccessible record whose file removal remains pending.
Local cleanup also removes only that asset's validated atomic-sanitization
temporary derivatives; it leaves other assets' files untouched.
Repeated calls can finish an already-deleted record's queued file without creating
new records. Previous signed download URLs can remain cached externally; object
removal cannot erase a recipient's downloaded copy.

Apply additive migration `20261111200000_photo_cleanup_worker.sql` in staging
before enabling scheduled cleanup. It adds an individually authorized cleanup
ticket RPC and a separate service-role-only bounded batch RPC. Anon and ordinary
authenticated accounts cannot run the cross-coach worker. Local PGlite invokes
the batch only through a loopback-guarded administrative connection.

An optional scheduler may GET `/api/maintenance/photo-cleanup` with
`Authorization: Bearer <CRON_SECRET>`. Set a unique server-only `CRON_SECRET`
of at least32 characters in the hosting secret store, and configure a schedule
such as once daily. Do not put the secret in URLs, source control or client-side
environment variables. The route returns only counts, never file paths or bodies.
Missing configuration returns503; a wrong credential returns401. The worker
prunes up to100 reservations older than24 hours, attempts at most100 removals,
then acknowledges only successful file deletions. Failures remain queued.

**No hosted cron, secret or production migration was configured by this change.**
Hosting deployment protection must also allow the configured scheduler to reach
this endpoint; an application credential alone does not establish that hosting
access or prove that a scheduled execution has occurred.
The coach's existing explicit cleanup action remains available. The new image
previews are generated transiently after authorization and create no separately
stored thumbnail objects requiring cleanup.
