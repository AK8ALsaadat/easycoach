-- Template content is reusable; nutrition targets belong to each trainee.
alter table public.template_metadata drop constraint template_metadata_kind_check;
alter table public.template_metadata add constraint template_metadata_kind_check
 check(kind in ('workout','nutrition','nutrition_targets'));

create table private.template_assignment_receipts (
 coach_id uuid not null references public.profiles(id), operation_id uuid not null,
 fingerprint jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(coach_id,operation_id)
);
revoke all on private.template_assignment_receipts from public,anon,authenticated;
grant select,insert on private.template_assignment_receipts to coach_api;

create function private.current_client_nutrition(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(
  (select r.payload from public.coaching_records r where r.client_id=target and r.coach_id=private.session_uid()
   and r.kind='nutrition_target' and r.entry_date<=(now() at time zone 'Asia/Riyadh')::date order by r.entry_date desc,r.created_at desc limit 1),
  (select p.content->'nutrition' from public.programs p where p.client_id=target and p.coach_id=private.session_uid()
   order by (p.published_at is null) desc,p.version desc limit 1),
  '{"calories":0,"protein":0,"carbs":0,"fat":0,"text":"","meals":[]}'::jsonb)
$$;
alter function private.current_client_nutrition(uuid) owner to coach_api;
revoke all on function private.current_client_nutrition(uuid) from public,anon,authenticated;

create function private.save_typed_template(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); saved jsonb; begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'هذه العملية للمدرب فقط'; end if;
 saved:=private.app_command('template_save',body);
 insert into public.template_metadata(template_id,coach_id,description,archived,kind)
 values((saved->>'id')::uuid,uid,coalesce(body->>'description',''),coalesce((body->>'archived')::boolean,false),body->>'kind')
 on conflict(template_id) do update set description=excluded.description,archived=excluded.archived,kind=excluded.kind;
 return saved;
end $$;
alter function private.save_typed_template(jsonb) owner to coach_api;
revoke all on function private.save_typed_template(jsonb) from public,anon,authenticated;

create function private.assign_personal_template(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); t public.templates; kind text; cid uuid; entry jsonb; base jsonb; nutrition jsonb; meals jsonb;
 saved jsonb; ids jsonb:='[]'; rid uuid; operation uuid:=(body->>'operation_id')::uuid; receipt private.template_assignment_receipts; begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'هذه العملية للمدرب فقط'; end if;
 if operation is not null then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text||operation::text,0));
  select * into receipt from private.template_assignment_receipts where coach_id=uid and operation_id=operation;
  if receipt.operation_id is not null then
   if receipt.fingerprint is distinct from body then raise exception 'بيانات المحاولة مختلفة؛ ابدأ تعيينًا جديدًا'; end if;
   return receipt.result;
  end if;
 end if;
 select * into t from public.templates where id=(body->>'id')::uuid and coach_id=uid;
 if t.id is null or exists(select 1 from public.template_metadata where template_id=t.id and archived) then raise exception 'القالب غير متاح'; end if;
 select m.kind into kind from public.template_metadata m where m.template_id=t.id;
 kind:=coalesce(kind,'workout');
 if kind<>'workout' and length(coalesce(t.content->'nutrition'->>'text',''))>4000 then raise exception 'اختصر ملاحظات قالب التغذية إلى 4000 حرف قبل التعيين'; end if;
 if jsonb_typeof(body->'clients') is distinct from 'array' or jsonb_array_length(body->'clients') not between 1 and 100 then raise exception 'اختر 1 إلى 100 عميل'; end if;
 if (select count(distinct x#>>'{}') from jsonb_array_elements(body->'clients') x)<>jsonb_array_length(body->'clients') then raise exception 'العميل مكرر'; end if;
 -- Stable lock order makes a multi-trainee assignment atomic and avoids reversed lock ordering.
 for cid in select value::uuid from jsonb_array_elements_text(body->'clients') order by value loop
  perform id from public.clients where id=cid and coach_id=uid and not archived for update;
  if not found then raise exception 'عميل خارج حسابك'; end if;
  if kind='workout' and exists(select 1 from public.programs where client_id=cid and published_at is null)
   and not coalesce((body->>'replace_drafts')::boolean,false) then raise exception 'توجد مسودة؛ اختر استبدال المسودات صراحة'; end if;
 end loop;
 for cid in select value::uuid from jsonb_array_elements_text(body->'clients') order by value loop
  nutrition:=private.current_client_nutrition(cid);
  if kind in ('nutrition','nutrition_targets') then
   if kind='nutrition_targets' then nutrition:=t.content->'nutrition';
   else
    -- Food instructions are reusable; matching per-trainee meal targets remain personal.
    select coalesce(jsonb_agg((meal-array['calories','protein','carbs','fat'])||jsonb_build_object(
     'calories',coalesce(previous->'calories','0'::jsonb),'protein',coalesce(previous->'protein','0'::jsonb),
     'carbs',coalesce(previous->'carbs','0'::jsonb),'fat',coalesce(previous->'fat','0'::jsonb)) order by position),'[]'::jsonb)
     into meals from jsonb_array_elements(coalesce(t.content->'nutrition'->'meals','[]'::jsonb)) with ordinality as template_meal(meal,position)
     left join lateral (select value as previous from jsonb_array_elements(coalesce(nutrition->'meals','[]'::jsonb))
      where value->>'name'=meal->>'name' limit 1) personal on true;
    nutrition:=jsonb_build_object('calories',nutrition->'calories','protein',nutrition->'protein','carbs',nutrition->'carbs','fat',nutrition->'fat',
     'text',coalesce(t.content->'nutrition'->>'text',''),'meals',meals);
   end if;
   -- Nutrition works without a workout, and does not publish or replace training drafts.
   saved:=private.write_coaching_record(jsonb_build_object('id',gen_random_uuid(),'client_id',cid,'kind','nutrition_target',
    'entry_date',(now() at time zone 'Asia/Riyadh')::date,'payload',nutrition));
   ids:=ids||jsonb_build_array(saved->>'id');
  else
   base:=jsonb_set(t.content,'{nutrition}',nutrition);
   -- Stored legacy template fields remain untouched; a new generic assignment never presets personal loading.
   select jsonb_agg(jsonb_set(day,'{exercises}',(select jsonb_agg(exercise-array['weight','rpe','rir','tempo'] order by exercise_position)
    from jsonb_array_elements(day->'exercises') with ordinality as ex(exercise,exercise_position))) order by day_position)
    into entry from jsonb_array_elements(base->'days') with ordinality as days(day,day_position);
   base:=jsonb_set(base,'{days}',entry);
   saved:=private.app_command('program_save',jsonb_build_object('client_id',cid,'name',t.name,'content',base)); rid:=(saved->>'id')::uuid;
   if coalesce((body->>'publish')::boolean,false) then perform private.app_command('program_publish',jsonb_build_object('id',rid)); end if;
   ids:=ids||jsonb_build_array(rid);
  end if;
 end loop;
 saved:=jsonb_build_object('assigned',jsonb_array_length(ids),'program_ids',case when kind='workout' then ids else '[]'::jsonb end,
  'nutrition_ids',case when kind<>'workout' then ids else '[]'::jsonb end);
 if operation is not null then insert into private.template_assignment_receipts(coach_id,operation_id,fingerprint,result) values(uid,operation,body,saved); end if;
 return saved;
end $$;
alter function private.assign_personal_template(jsonb) owner to coach_api;
revoke all on function private.assign_personal_template(jsonb) from public,anon,authenticated;

do $migration$ declare definition text; start_at int; end_at int; original text; begin
 select pg_get_functiondef('private.management_command(text,jsonb)'::regprocedure) into definition;
 start_at:=position(' when ''template_assign'' then' in definition);
 end_at:=position(' when ''import_data'' then' in definition);
 if start_at=0 or end_at<=start_at then raise exception 'Template assignment definition changed'; end if;
 original:=substring(definition from start_at for end_at-start_at);
 definition:=replace(definition,original,' when ''template_assign'' then return private.assign_personal_template(input_data);'||chr(10));
 definition:=replace(definition,' when ''template_meta'' then',' when ''template_save_typed'' then return private.save_typed_template(input_data);'||chr(10)||' when ''template_meta'' then');
 execute definition;
end $migration$;
