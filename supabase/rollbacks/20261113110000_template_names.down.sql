-- Reverses 20261113110000_template_names.sql. Renamed duplicates keep their
-- new "(n)" suffix. Run manually, then remove the migration row.
do $migration$ declare definition text; begin
 select pg_get_functiondef('private.assign_personal_template(jsonb)'::regprocedure) into definition;
 definition := replace(definition, ' if private.template_unnamed(t.name) then raise exception ''سمِّ القالب قبل استخدامه في برنامج متدرب''; end if;' || chr(10), '');
 definition := replace(definition, ' update public.template_metadata set last_used_at=now() where template_id=t.id;' || chr(10), '');
 execute definition;
 select pg_get_functiondef('private.management_command(text,jsonb)'::regprocedure) into definition;
 definition := replace(definition, ' when ''template_rename'' then result:=private.rename_template(input_data);' || chr(10), '');
 definition := replace(definition, ' when ''template_touch'' then result:=private.touch_template(input_data);' || chr(10), '');
 definition := replace(definition, 'result:=private.save_template_meta(input_data);',
  'insert into public.template_metadata(template_id,coach_id,description,archived,kind) values((input_data->>''id'')::uuid,uid,input_data->>''description'',(input_data->>''archived'')::boolean,input_data->>''kind'') on conflict(template_id) do update set description=excluded.description,archived=excluded.archived,kind=excluded.kind returning to_jsonb(template_metadata) into result;');
 definition := replace(definition, 'coalesce(nullif(btrim(input_data->>''name''),''''),private.next_template_copy_name(uid,t.name))', 'coalesce(input_data->>''name'',left(t.name||'' · نسخة'',140))');
 definition := replace(definition, 'insert into public.template_metadata(template_id,coach_id,description,archived,kind,goal,level,days_per_week) select (result->>''id'')::uuid,uid,description,false,kind,goal,level,days_per_week from public.template_metadata where template_id=t.id;',
  'insert into public.template_metadata(template_id,coach_id,description,archived,kind) select (result->>''id'')::uuid,uid,description,false,kind from public.template_metadata where template_id=t.id;');
 execute definition;
end $migration$;
create or replace function private.save_typed_template(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); saved jsonb; begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'هذه العملية للمدرب فقط'; end if;
 saved:=private.app_command('template_save',body);
 insert into public.template_metadata(template_id,coach_id,description,archived,kind)
 values((saved->>'id')::uuid,uid,coalesce(body->>'description',''),coalesce((body->>'archived')::boolean,false),body->>'kind')
 on conflict(template_id) do update set description=excluded.description,archived=excluded.archived,kind=excluded.kind;
 return saved;
end $$;
drop function if exists private.touch_template(jsonb);
drop function if exists private.rename_template(jsonb);
drop function if exists private.save_template_meta(jsonb);
drop function if exists private.next_template_copy_name(uuid,text);
alter table public.template_metadata drop column if exists last_used_at, drop column if exists days_per_week,
 drop column if exists level, drop column if exists goal;
drop trigger if exists check_template_name on public.templates;
drop function if exists private.check_template_name();
drop index if exists public.templates_coach_name_key;
drop function if exists private.template_unnamed(text);
drop function if exists private.template_name_key(text);
