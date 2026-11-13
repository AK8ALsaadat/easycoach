-- Templates need a real, unique name per coach (case and extra spaces ignored),
-- plus optional goal / level / days-per-week tags and last-use ordering.
-- Rollback: supabase/rollbacks/20261113110000_template_names.down.sql

create function private.template_name_key(name text) returns text language sql immutable set search_path='' as $$
 select lower(regexp_replace(btrim(coalesce(name,'')), '\s+', ' ', 'g'))
$$;
-- Placeholder names from the old flow, including numbered copies of them.
create function private.template_unnamed(name text) returns boolean language sql immutable set search_path='' as $$
 select private.template_name_key(name) ~ '^(قالب جديد|مسودة جديدة)( ?(·|\().*)?$'
$$;
revoke all on function private.template_name_key(text), private.template_unnamed(text) from public,anon;
grant execute on function private.template_name_key(text), private.template_unnamed(text) to authenticated,coach_api;

-- Existing duplicates get a visible numeric suffix so the unique index can be created.
do $$ declare r record; n int; candidate text; begin
 for r in
  select id, coach_id, name from (
   select t.*, row_number() over (partition by coach_id, private.template_name_key(name) order by updated_at, id) as position
   from public.templates t) d
  where position > 1
 loop
  n := 2;
  loop
   candidate := left(btrim(r.name), 60 - length(' (' || n || ')')) || ' (' || n || ')';
   exit when not exists(select 1 from public.templates where coach_id=r.coach_id and private.template_name_key(name)=private.template_name_key(candidate));
   n := n + 1;
  end loop;
  update public.templates set name=candidate where id=r.id;
 end loop;
end $$;
create unique index templates_coach_name_key on public.templates(coach_id, private.template_name_key(name));

create function private.check_template_name() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='UPDATE' and new.name is not distinct from old.name then return new; end if;
 new.name := regexp_replace(btrim(coalesce(new.name,'')), '\s+', ' ', 'g');
 if length(new.name) < 2 or length(new.name) > 60 then raise exception 'اسم القالب لازم يكون من 2 إلى 60 حرفًا'; end if;
 if private.template_unnamed(new.name) then raise exception 'اختر اسمًا واضحًا للقالب بدل «قالب جديد» أو «مسودة جديدة»'; end if;
 if exists(select 1 from public.templates where coach_id=new.coach_id and id<>new.id and private.template_name_key(name)=private.template_name_key(new.name)) then
  raise exception 'عندك قالب بنفس الاسم';
 end if;
 return new;
end $$;
revoke all on function private.check_template_name() from public,anon,authenticated;
create trigger check_template_name before insert or update of name on public.templates
 for each row execute function private.check_template_name();

alter table public.template_metadata
 add column goal text check (goal is null or goal in ('hypertrophy','fat_loss','fitness','strength','general')),
 add column level text check (level is null or level in ('beginner','intermediate','advanced')),
 add column days_per_week integer check (days_per_week is null or days_per_week between 1 and 7),
 add column last_used_at timestamptz;

create function private.next_template_copy_name(owner uuid, base text) returns text language plpgsql stable set search_path='' as $$
declare root text := regexp_replace(btrim(base), '\s*\(نسخة( [0-9]+)?\)$', ''); suffix text; candidate text; n int := 1; begin
 loop
  suffix := case when n = 1 then ' (نسخة)' else ' (نسخة ' || n || ')' end;
  candidate := btrim(left(root, 60 - length(suffix))) || suffix;
  exit when not exists(select 1 from public.templates where coach_id=owner and private.template_name_key(name)=private.template_name_key(candidate));
  n := n + 1;
 end loop;
 return candidate;
end $$;
revoke all on function private.next_template_copy_name(uuid,text) from public,anon;
grant execute on function private.next_template_copy_name(uuid,text) to authenticated,coach_api;

-- Optional tags: keys that are absent keep their stored value.
create function private.save_template_meta(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid := private.session_uid(); tid uuid := (body->>'id')::uuid; result jsonb; begin
 if uid is null or not exists(select 1 from public.templates where id=tid and coach_id=uid) then raise exception 'القالب غير متاح'; end if;
 insert into public.template_metadata(template_id,coach_id,description,archived,kind,goal,level,days_per_week)
 values(tid,uid,coalesce(body->>'description',''),coalesce((body->>'archived')::boolean,false),coalesce(body->>'kind','workout'),
  nullif(body->>'goal',''),nullif(body->>'level',''),(nullif(body->>'days_per_week',''))::int)
 on conflict(template_id) do update set
  description=case when body ? 'description' then excluded.description else template_metadata.description end,
  archived=case when body ? 'archived' then excluded.archived else template_metadata.archived end,
  kind=case when body ? 'kind' then excluded.kind else template_metadata.kind end,
  goal=case when body ? 'goal' then excluded.goal else template_metadata.goal end,
  level=case when body ? 'level' then excluded.level else template_metadata.level end,
  days_per_week=case when body ? 'days_per_week' then excluded.days_per_week else template_metadata.days_per_week end
 returning to_jsonb(template_metadata) into result;
 return result;
end $$;
revoke all on function private.save_template_meta(jsonb) from public,anon,authenticated;
grant execute on function private.save_template_meta(jsonb) to coach_api;

create or replace function private.save_typed_template(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); saved jsonb; begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'هذه العملية للمدرب فقط'; end if;
 saved:=private.app_command('template_save',body);
 perform private.save_template_meta(jsonb_build_object('id',saved->>'id','description',coalesce(body->>'description',''),
  'archived',coalesce((body->>'archived')::boolean,false),'kind',body->>'kind')
  || (body - array['id','name','content','description','archived','kind']) );
 return saved;
end $$;

create function private.rename_template(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid := private.session_uid(); result jsonb; begin
 update public.templates set name=body->>'name', updated_at=now() where id=(body->>'id')::uuid and coach_id=uid returning to_jsonb(templates) into result;
 if result is null then raise exception 'القالب غير متاح'; end if;
 return result;
end $$;
revoke all on function private.rename_template(jsonb) from public,anon,authenticated;
grant execute on function private.rename_template(jsonb) to coach_api;

create function private.touch_template(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid := private.session_uid(); t public.templates; begin
 select * into t from public.templates where id=(body->>'id')::uuid and coach_id=uid;
 if t.id is null then raise exception 'القالب غير متاح'; end if;
 if private.template_unnamed(t.name) then raise exception 'سمِّ القالب قبل استخدامه في برنامج متدرب'; end if;
 insert into public.template_metadata(template_id,coach_id,last_used_at) values(t.id,uid,now())
 on conflict(template_id) do update set last_used_at=now();
 return jsonb_build_object('id',t.id,'last_used_at',now());
end $$;
revoke all on function private.touch_template(jsonb) from public,anon,authenticated;
grant execute on function private.touch_template(jsonb) to coach_api;

do $migration$ declare definition text; original text; begin
 select pg_get_functiondef('private.management_command(text,jsonb)'::regprocedure) into definition;
 original := 'insert into public.template_metadata(template_id,coach_id,description,archived,kind) values((input_data->>''id'')::uuid,uid,input_data->>''description'',(input_data->>''archived'')::boolean,input_data->>''kind'') on conflict(template_id) do update set description=excluded.description,archived=excluded.archived,kind=excluded.kind returning to_jsonb(template_metadata) into result;';
 if position(original in definition)=0 then raise exception 'template_meta branch changed'; end if;
 definition := replace(definition, original, 'result:=private.save_template_meta(input_data);');
 original := 'coalesce(input_data->>''name'',left(t.name||'' · نسخة'',140))';
 if position(original in definition)=0 then raise exception 'template_duplicate naming changed'; end if;
 definition := replace(definition, original, 'coalesce(nullif(btrim(input_data->>''name''),''''),private.next_template_copy_name(uid,t.name))');
 original := 'insert into public.template_metadata(template_id,coach_id,description,archived,kind) select (result->>''id'')::uuid,uid,description,false,kind from public.template_metadata where template_id=t.id;';
 if position(original in definition)=0 then raise exception 'template_duplicate metadata changed'; end if;
 definition := replace(definition, original, 'insert into public.template_metadata(template_id,coach_id,description,archived,kind,goal,level,days_per_week) select (result->>''id'')::uuid,uid,description,false,kind,goal,level,days_per_week from public.template_metadata where template_id=t.id;');
 definition := replace(definition, ' when ''template_meta'' then',
  ' when ''template_rename'' then result:=private.rename_template(input_data);' || chr(10) ||
  ' when ''template_touch'' then result:=private.touch_template(input_data);' || chr(10) ||
  ' when ''template_meta'' then');
 if position('template_touch' in definition)=0 then raise exception 'management_command layout changed'; end if;
 execute definition;

 select pg_get_functiondef('private.assign_personal_template(jsonb)'::regprocedure) into definition;
 original := 'kind:=coalesce(kind,''workout'');';
 if position(original in definition)=0 then raise exception 'assign_personal_template changed'; end if;
 execute replace(definition, original, original || chr(10) ||
  ' if private.template_unnamed(t.name) then raise exception ''سمِّ القالب قبل استخدامه في برنامج متدرب''; end if;' || chr(10) ||
  ' update public.template_metadata set last_used_at=now() where template_id=t.id;');
end $migration$;
