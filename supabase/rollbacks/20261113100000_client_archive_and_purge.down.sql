-- Reverses 20261113100000_client_archive_and_purge.sql (permanently deleted
-- trainees cannot be brought back). Run manually, then remove the migration row.
drop function if exists public.trainee_access_status();
drop function if exists public.client_purge(uuid,text);
drop function if exists public.client_purge_summary(uuid);
create or replace function public.immutable_finance() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'السجل ثابت؛ استخدم التصحيح الموثق'; end $$;
alter function public.immutable_finance() security invoker;
drop table if exists private.client_purges;
do $$ declare definition text; begin
 select pg_get_functiondef('private.management_command(text,jsonb)'::regprocedure) into definition;
 execute replace(definition, 'result:=private.client_archive(input_data);',
  'update public.clients set archived=(input_data->>''archived'')::boolean,updated_at=now() where id=(input_data->>''client_id'')::uuid and coach_id=uid returning to_jsonb(clients) into result;');
end $$;
drop function if exists private.client_archive(jsonb);
drop trigger if exists stamp_client_archive on public.clients;
drop function if exists private.stamp_client_archive();
alter table public.clients drop column if exists archived_reason, drop column if exists archived_at;
