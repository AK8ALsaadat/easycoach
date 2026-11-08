-- Private deletion jobs keep storage cleanup retryable after a verified erasure request.
create table private.progress_photo_deletions(id uuid primary key,coach_id uuid not null references public.profiles(id),asset_path text not null,created_at timestamptz not null default now());
alter table private.progress_photo_deletions enable row level security;
revoke all on private.progress_photo_deletions from public,anon,authenticated,coach_api;
create function private.queue_progress_photo_deletion() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into private.progress_photo_deletions(id,coach_id,asset_path) values(old.id,old.coach_id,old.coach_id::text||'/'||old.client_id::text||'/'||old.id::text) on conflict do nothing; return old;
end $$;
revoke all on function private.queue_progress_photo_deletion() from public,anon,authenticated;
create trigger queue_progress_photo_deletion before delete on public.progress_photos for each row execute function private.queue_progress_photo_deletion();
create function private.photo_cleanup(completed jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ declare uid uuid:=private.session_uid(); result jsonb; begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'Coach access required'; end if;
 delete from private.progress_photo_deletions where coach_id=uid and id in (select value::uuid from jsonb_array_elements_text(coalesce(completed,'[]'::jsonb)));
 select coalesce(jsonb_agg(j),'[]'::jsonb) into result from (select id,asset_path from private.progress_photo_deletions where coach_id=uid order by created_at limit 100) j;return result;
end $$;
revoke all on function private.photo_cleanup(jsonb) from public,anon;
grant execute on function private.photo_cleanup(jsonb) to authenticated;
create function public.photo_cleanup(completed jsonb default '[]'::jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.photo_cleanup(completed) $$;
revoke all on function public.photo_cleanup(jsonb) from public,anon;
grant execute on function public.photo_cleanup(jsonb) to authenticated;
create function private.profile_update(display_name text) returns boolean language plpgsql security definer set search_path='' as $$ declare uid uuid:=private.session_uid(); begin
 if uid is null or length(trim(display_name)) not between 2 and 120 then raise exception 'Invalid display name'; end if;
 update public.profiles set name=trim(display_name) where id=uid;return found;
end $$;
revoke all on function private.profile_update(text) from public,anon;
grant execute on function private.profile_update(text) to authenticated;
create function public.profile_update(display_name text) returns boolean language sql security invoker set search_path='' as $$ select private.profile_update(display_name) $$;
revoke all on function public.profile_update(text) from public,anon;
grant execute on function public.profile_update(text) to authenticated;

-- A merge updates only mapped contact fields; an omitted phone column preserves the old phone.
do $$ declare definition text; begin
 select pg_get_functiondef('private.import_management(jsonb)'::regprocedure) into definition;
 execute replace(definition,
 $old$private.app_command('client_save',(d->'client')||jsonb_build_object('id',cl.id))$old$,
 $new$private.app_command('client_save',(d->'client')||jsonb_build_object('id',cl.id,'phone',case when v ? 'phone' then d->'client'->>'phone' else cl.phone end))$new$);
end $$;

-- Do not inherit permissive hosted default table grants. Writes use the checked RPCs.
revoke all on public.client_details,public.coaching_records,public.template_metadata,public.import_batches,public.account_preferences,public.progress_photos,public.import_subscription_refs from public,anon;
revoke insert,update,delete,truncate,references,trigger on public.client_details,public.coaching_records,public.template_metadata,public.import_batches,public.account_preferences,public.progress_photos,public.import_subscription_refs from authenticated;

-- Accumulate undo rows once, avoiding quadratic JSON array copies on larger imports.
do $$ declare definition text; begin
 select pg_get_functiondef('private.import_management(jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'-- Create/update identities first;', 'create temporary table management_import_changes(position bigint generated always as identity,change jsonb) on commit drop; -- Create/update identities first;');
 definition:=regexp_replace(definition,$pattern$changes:=changes\|\|jsonb_build_array\(([^\n]*)\);$pattern$,$replacement$insert into pg_temp.management_import_changes(change) values(\1);$replacement$,'gn');
 definition:=replace(definition,$old$report:=jsonb_build_object('clients_created'$old$,$new$select coalesce(jsonb_agg(change order by position),'[]'::jsonb) into changes from pg_temp.management_import_changes; report:=jsonb_build_object('clients_created'$new$);
 execute definition;
end $$;
