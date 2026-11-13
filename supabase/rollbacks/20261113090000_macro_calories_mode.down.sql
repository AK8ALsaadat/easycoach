-- Reverses 20261113090000_macro_calories_mode.sql.
-- Run manually (psql / SQL editor) and then delete the migration row from
-- supabase_migrations.schema_migrations (or private.app_migrations locally).
-- Rows saved with calories_mode keep the key in JSON; strip it first so the
-- restored strict validators keep accepting future updates of those rows.
update public.coaching_records set payload = payload - 'calories_mode'
 where kind = 'nutrition_target' and payload ? 'calories_mode';
alter table public.programs disable trigger published_snapshot;
update public.programs set content = jsonb_set(content, '{nutrition}', (content->'nutrition') - 'calories_mode')
 where content->'nutrition' ? 'calories_mode';
alter table public.programs enable trigger published_snapshot;
update public.templates set content = jsonb_set(content, '{nutrition}', (content->'nutrition') - 'calories_mode')
 where content->'nutrition' ? 'calories_mode';

alter table public.coaching_records drop constraint if exists nutrition_target_calories_mode;
do $$ declare definition text; begin
 select pg_get_functiondef('private.valid_coaching_record(text,jsonb)'::regprocedure) into definition;
 execute replace(definition,
  'allowed:=array[''calories'',''protein'',''carbs'',''fat'',''text'',''meals'',''calories_mode''];',
  'allowed:=array[''calories'',''protein'',''carbs'',''fat'',''text'',''meals''];');
end $$;
create or replace function public.valid_content(body jsonb) returns boolean
language sql immutable set search_path='' as $$ select private.valid_content_before_macros(body) $$;
drop function private.valid_calories_mode(jsonb);
