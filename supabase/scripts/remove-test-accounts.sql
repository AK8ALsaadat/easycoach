-- =============================================================================
-- Remove the demo account and synthetic review accounts before launch.
--
-- NOT a migration. Nothing runs this automatically. Run it yourself in the
-- Supabase SQL editor (project easycoaching), in two steps:
--
--   STEP 1  Run only the PREVIEW block. It changes nothing and shows exactly
--           which accounts, rows and storage files would be removed.
--   STEP 2  Run the DELETE block. It runs in one transaction and ends with a
--           check. To rehearse first, change the final COMMIT to ROLLBACK.
--
-- Targets: the demo identity test@demo.easycoach.test and every
-- synthetic review account on the reserved @example.test domain. Real accounts
-- are never matched; STEP 2 aborts if anything else appears in the target list.
--
-- Storage files: Supabase forbids deleting storage files with SQL (it would
-- leave the files orphaned). STEP 1 lists them; delete them from
-- Dashboard -> Storage (bucket + folder shown in the list) before or after STEP 2.
-- =============================================================================


-- =============================== STEP 1: PREVIEW =============================
with targets as (
  select id, email from auth.users
  where email = 'test@demo.easycoach.test' or email like '%@example.test'
),
coach_clients as (
  select id from public.clients where coach_id in (select id from targets)
)
select 'account' as kind, t.email as item, coalesce(p.role, 'no profile') as detail
from targets t left join public.profiles p on p.id = t.id
union all select 'clients', count(*)::text, 'متدربين تابعين لهذه الحسابات' from coach_clients
union all select 'programs', count(*)::text, '' from public.programs where coach_id in (select id from targets)
union all select 'templates', count(*)::text, '' from public.templates where coach_id in (select id from targets)
union all select 'exercises', count(*)::text, '' from public.exercises where coach_id in (select id from targets)
union all select 'subscriptions', count(*)::text, '' from public.subscriptions where coach_id in (select id from targets)
union all select 'payments', count(*)::text, '' from public.payments where coach_id in (select id from targets)
union all select 'freezes', count(*)::text, '' from public.freezes where coach_id in (select id from targets)
union all select 'weight_entries', count(*)::text, '' from public.weight_entries where coach_id in (select id from targets)
union all select 'coaching_records (messages, check-ins…)', count(*)::text, '' from public.coaching_records where coach_id in (select id from targets) or author_id in (select id from targets)
union all select 'progress_photos', count(*)::text, '' from public.progress_photos where coach_id in (select id from targets) or author_id in (select id from targets)
union all select 'media_assets (videos)', count(*)::text, '' from public.media_assets where coach_id in (select id from targets)
union all select 'support_tickets', count(*)::text, '' from public.support_tickets where author_id in (select id from targets)
union all select 'audit', count(*)::text, '' from public.audit where coach_id in (select id from targets)
union all select 'real clients unlinked from a test trainee login', count(*)::text, 'يبقى المتدرب عند مدربه، ويُلغى ربط الحساب فقط'
  from public.clients where trainee_user_id in (select id from targets) and coach_id not in (select id from targets)
union all select 'storage file (delete in Dashboard)', o.bucket_id || ' / ' || o.name, ''
  from storage.objects o
  where split_part(o.name, '/', 1) in (select id::text from targets)
     or o.name in (select attachment_path from public.support_tickets where author_id in (select id from targets) and attachment_path is not null);


-- =============================== STEP 2: DELETE ==============================
begin;

create temp table cleanup_targets on commit drop as
  select id, email from auth.users
  where email = 'test@demo.easycoach.test' or email like '%@example.test';

do $$ begin
  if exists (select 1 from cleanup_targets
             where email <> 'test@demo.easycoach.test' and email not like '%@example.test') then
    raise exception 'Unexpected account in the target list; nothing was deleted';
  end if;
end $$;

create temp table cleanup_clients on commit drop as
  select id from public.clients where coach_id in (select id from cleanup_targets);

-- Payments and freezes are immutable except inside a recorded purge (same rule
-- the app uses for permanent trainee deletion).
insert into private.client_purges(txid, client_id)
  select txid_current(), id from cleanup_clients;

delete from public.payments where coach_id in (select id from cleanup_targets);
delete from public.freezes where coach_id in (select id from cleanup_targets);
delete from public.import_subscription_refs where coach_id in (select id from cleanup_targets);
delete from public.subscriptions where coach_id in (select id from cleanup_targets);
delete from public.weight_entries where coach_id in (select id from cleanup_targets);
delete from public.client_goals where coach_id in (select id from cleanup_targets);
delete from public.programs where coach_id in (select id from cleanup_targets);
delete from public.invitations where coach_id in (select id from cleanup_targets);
delete from public.portal_links where coach_id in (select id from cleanup_targets);
delete from public.privacy_requests where coach_id in (select id from cleanup_targets);
delete from public.coaching_records
  where coach_id in (select id from cleanup_targets) or author_id in (select id from cleanup_targets);
delete from public.progress_photos
  where coach_id in (select id from cleanup_targets) or author_id in (select id from cleanup_targets);
delete from public.client_consents
  where coach_id in (select id from cleanup_targets) or accepted_by in (select id from cleanup_targets);

-- A real coach's trainee who logged in with a test account keeps their record; only the login link goes.
update public.clients set trainee_user_id = null
  where trainee_user_id in (select id from cleanup_targets) and coach_id not in (select id from cleanup_targets);
delete from public.clients where coach_id in (select id from cleanup_targets);

delete from public.upload_sessions where coach_id in (select id from cleanup_targets);
delete from public.media_assets where coach_id in (select id from cleanup_targets);
delete from public.templates where coach_id in (select id from cleanup_targets);
delete from public.exercises where coach_id in (select id from cleanup_targets);
delete from public.join_requests where coach_id in (select id from cleanup_targets);
delete from public.join_links where coach_id in (select id from cleanup_targets);
delete from public.import_batches where coach_id in (select id from cleanup_targets);
delete from public.account_preferences where user_id in (select id from cleanup_targets);
delete from public.coach_branding where coach_id in (select id from cleanup_targets);
delete from public.support_tickets where author_id in (select id from cleanup_targets);
delete from public.audit where coach_id in (select id from cleanup_targets);
delete from private.coaching_record_versions where actor_id in (select id from cleanup_targets);
delete from private.progress_photo_deletions where coach_id in (select id from cleanup_targets);
delete from private.template_assignment_receipts where coach_id in (select id from cleanup_targets);
delete from private.client_purges where txid = txid_current();

delete from public.profiles where id in (select id from cleanup_targets);
delete from auth.users where id in (select id from cleanup_targets);

-- Check: must return 0 accounts left and list only real accounts.
select
  (select count(*) from auth.users
    where email = 'test@demo.easycoach.test' or email like '%@example.test') as test_accounts_left,
  (select string_agg(email, ', ') from auth.users) as remaining_accounts;

commit;  -- change to ROLLBACK to rehearse without deleting
