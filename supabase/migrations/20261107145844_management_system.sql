-- Additive management records. Existing programs, ledgers and identities remain unchanged.
create table public.client_details (
 client_id uuid primary key, coach_id uuid not null,
 birth_date date, age integer check(age between 0 and 120), gender text not null default 'unspecified' check(gender in ('male','female','other','unspecified')),
 height numeric check(height between 50 and 250), start_date date, status text not null default 'active' check(status in ('active','inactive','new')),
 updated_at timestamptz not null default now(), foreign key(client_id,coach_id) references public.clients(id,coach_id) on delete cascade
);
create table public.coaching_records (
 id uuid primary key, client_id uuid not null, coach_id uuid not null,
 kind text not null check(kind in ('measurement','nutrition_log','nutrition_target','workout_log','checkin','note','message','program_history','goal_history')),
 entry_date date not null check(entry_date>='1900-01-01'), payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=262144),
 author_id uuid not null references public.profiles(id), source_key text not null check(length(source_key) between 1 and 160),
 reviewed_at timestamptz, coach_feedback text not null default '' check(length(coach_feedback)<=4000), read_at timestamptz,
 created_at timestamptz not null default now(), unique(client_id,kind,source_key),
 foreign key(client_id,coach_id) references public.clients(id,coach_id) on delete cascade
);
create table public.template_metadata (
 template_id uuid primary key, coach_id uuid not null, description text not null default '' check(length(description)<=2000),
 archived boolean not null default false, kind text not null default 'workout' check(kind in ('workout','nutrition')),
 foreign key(template_id,coach_id) references public.templates(id,coach_id) on delete cascade
);
create table public.import_batches (
 id uuid primary key, coach_id uuid not null references public.profiles(id), fingerprint text not null check(length(fingerprint)=64),
 status text not null default 'applied' check(status in ('applied','undone')), report jsonb not null, changes jsonb not null,
 created_at timestamptz not null default now(), unique(coach_id,fingerprint)
);
create table public.account_preferences (
 user_id uuid primary key references public.profiles(id), language text not null default 'ar' check(language in ('ar','en')),
 checkin_days integer not null default 7 check(checkin_days between 1 and 30), weight_days integer not null default 7 check(weight_days between 1 and 90),
 reminders boolean not null default true, low_adherence numeric not null default 60 check(low_adherence between 0 and 100)
);
create table public.progress_photos (
 id uuid primary key, client_id uuid not null, coach_id uuid not null, author_id uuid not null references public.profiles(id),
 entry_date date not null check(entry_date>='1900-01-01' and entry_date<=(now() at time zone 'Asia/Riyadh')::date), filename text not null check(length(filename) between 1 and 160), size integer not null check(size between 1 and 10485760),
 mime text not null check(mime in ('image/jpeg','image/png','image/webp')), status text not null default 'pending' check(status in ('pending','ready')),
 created_at timestamptz not null default now(), foreign key(client_id,coach_id) references public.clients(id,coach_id) on delete cascade
);
create index coaching_owner_history on public.coaching_records(coach_id,client_id,kind,entry_date desc,created_at desc);
create index coaching_unreviewed on public.coaching_records(coach_id,kind,reviewed_at) where kind='checkin';
create index details_owner_status on public.client_details(coach_id,status);
create index template_metadata_owner on public.template_metadata(coach_id,archived);
create index import_owner on public.import_batches(coach_id,created_at desc);
create index photo_owner_client on public.progress_photos(coach_id,client_id,entry_date desc);

do $$ declare t text; begin
 foreach t in array array['client_details','coaching_records','progress_photos'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy management_read on public.%I for select to authenticated,coach_api using(coach_id=(select private.session_uid()) or exists(select 1 from public.clients c where c.id=client_id and c.trainee_user_id=(select private.session_uid()) and not c.archived))',t);
  execute format('grant select on public.%I to authenticated,coach_api',t);
 end loop;
 foreach t in array array['template_metadata','import_batches'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy owner_read on public.%I for select to authenticated,coach_api using(coach_id=(select private.session_uid()))',t);
  execute format('create policy owner_write on public.%I for all to coach_api using(coach_id=(select private.session_uid())) with check(coach_id=(select private.session_uid()))',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to coach_api',t);
 end loop;
end $$;
drop policy management_read on public.coaching_records;
create policy management_read on public.coaching_records for select to authenticated,coach_api using(coach_id=(select private.session_uid()) or (kind<>'note' and exists(select 1 from public.clients c where c.id=client_id and c.trainee_user_id=(select private.session_uid()) and not c.archived)));
alter table public.account_preferences enable row level security;
create policy preference_owner on public.account_preferences for all to authenticated,coach_api using(user_id=(select private.session_uid())) with check(user_id=(select private.session_uid()));
grant select on public.account_preferences to authenticated;
grant select,insert,update on public.account_preferences to coach_api;

-- Validate new optional prescription fields while retaining validation of every legacy field.
do $$ declare definition text; begin
 select pg_get_functiondef('public.valid_content(jsonb)'::regprocedure) into definition;
 execute replace(definition,'public.valid_content','private.valid_content_studio');
end $$;
create or replace function public.valid_content(body jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare clean jsonb:=body; days jsonb:='[]'; d jsonb; e jsonb; ex jsonb; k text; begin
 if jsonb_typeof(body->'days') is distinct from 'array' then return false; end if;
 for d in select value from jsonb_array_elements(body->'days') loop
  if d ? 'weekday' and (jsonb_typeof(d->'weekday')<>'number' or (d->>'weekday')::numeric<>trunc((d->>'weekday')::numeric) or (d->>'weekday')::int not between 0 and 6) then return false; end if;
  ex:='[]';
  for e in select value from jsonb_array_elements(d->'exercises') loop
   foreach k in array array['weight','rpe','rir'] loop
    if e ? k and (jsonb_typeof(e->k)<>'number' or (e->>k)::numeric<0 or (e->>k)::numeric>case k when 'weight' then 1500 when 'rpe' then 10 else 20 end) then return false; end if;
   end loop;
   if e ? 'rir' and (e->>'rir')::numeric<>trunc((e->>'rir')::numeric) then return false; end if;
   if e ? 'tempo' and (jsonb_typeof(e->'tempo')<>'string' or length(e->>'tempo')>40) then return false; end if;
   ex:=ex||jsonb_build_array(e-array['weight','rpe','rir','tempo']);
  end loop;
  days:=days||jsonb_build_array(jsonb_set(d-'weekday','{exercises}',ex));
 end loop;
 return private.valid_content_studio(jsonb_set(clean,'{days}',days));
 exception when others then return false;
end $$;
revoke all on function private.valid_content_studio(jsonb) from public,anon;
grant execute on function private.valid_content_studio(jsonb) to authenticated,coach_api;

create function private.valid_coaching_record(kind text,body jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; e jsonb; allowed text[]; required text[]; begin
 if jsonb_typeof(body) is distinct from 'object' then return false; end if;
 case kind
 when 'measurement' then allowed:=array['weight','body_fat','waist','chest','arm','thigh','hips','bmi','custom','notes','historical_only']; required:=array[]::text[];
 when 'nutrition_log' then allowed:=array['calories','protein','carbs','fat','notes']; required:=array['calories','protein','carbs','fat'];
 when 'nutrition_target' then allowed:=array['calories','protein','carbs','fat','text','meals']; required:=array['calories','protein','carbs','fat'];
 when 'checkin' then allowed:=array['weight','sleep','energy','hunger','stress','training_adherence','nutrition_adherence','feedback','questions','photo_ids']; required:=array['sleep','energy','hunger','stress','training_adherence','nutrition_adherence'];
 when 'workout_log' then allowed:=array['day_name','completed','program_id','notes','exercises']; required:=array['day_name','completed'];
 when 'note','message' then allowed:=array['text']; required:=array['text'];
 when 'goal_history' then return body-array['goal','focus','target_weight']='{}'::jsonb and length(coalesce(body->>'goal',''))<=100 and length(coalesce(body->>'focus',''))<=200 and (body->>'target_weight' is null or (body->>'target_weight')::numeric between 20 and 400);
 when 'program_history' then return length(body->>'name') between 2 and 140 and body-array['name','content']='{}'::jsonb and public.valid_content(body->'content');
 else return false;
 end case;
 if body-allowed<>'{}'::jsonb or not(body ?& required) then return false; end if;
 for k in select jsonb_object_keys(body) loop
  if k in ('weight','body_fat','waist','chest','arm','thigh','hips','bmi','calories','protein','carbs','fat','sleep','energy','hunger','stress','training_adherence','nutrition_adherence') then
   if jsonb_typeof(body->k)<>'number' or (body->>k)::numeric<(case when k='weight' then 20 when k in ('sleep','energy','hunger','stress') then 1 else 0 end) or (body->>k)::numeric>(case when k='weight' then 400 when k='calories' then 10000 when k in ('protein','carbs','fat') then 1000 when k in ('sleep','energy','hunger','stress') then 5 when k in ('body_fat','training_adherence','nutrition_adherence') then 100 when k='bmi' then 150 else 300 end) then return false; end if;
  elsif k in ('text','notes','day_name','feedback','questions') then
   if jsonb_typeof(body->k)<>'string' or length(body->>k)>4000 then return false; end if;
  elsif k='custom' then
   if jsonb_typeof(body->k)<>'object' then return false; end if;
   for e in select jsonb_build_object('key',key,'value',value) from jsonb_each(body->k) loop
    if length(e->>'key') not between 1 and 60 or jsonb_typeof(e->'value')<>'number' or (e->>'value')::numeric not between 0 and 1000 then return false; end if;
   end loop;
  elsif k='photo_ids' then
   if jsonb_typeof(body->k)<>'array' or jsonb_array_length(body->k)>6 then return false; end if;
  elsif k in ('completed','historical_only') and jsonb_typeof(body->k)<>'boolean' then return false;
  elsif k='program_id' and (body->>k)!~'^[a-f0-9-]{36}$' then return false;
  elsif k in ('exercises','meals') and (jsonb_typeof(body->k)<>'array' or jsonb_array_length(body->k)>40) then return false;
  end if;
 end loop;
 if kind='checkin' then
  foreach k in array array['sleep','energy','hunger','stress'] loop
   if (body->>k)::numeric<>trunc((body->>k)::numeric) then return false; end if;
  end loop;
 end if;
 if body ? 'exercises' then
  for e in select value from jsonb_array_elements(body->'exercises') loop
   if jsonb_typeof(e)<>'object' or e-array['name','sets','reps','weight','rpe','rir']<>'{}'::jsonb or not(e ?& array['name','sets','reps']) or jsonb_typeof(e->'name')<>'string' or length(e->>'name') not between 2 and 140 or jsonb_typeof(e->'reps')<>'string' or length(e->>'reps')>60 or jsonb_typeof(e->'sets')<>'number' or (e->>'sets')::numeric not between 0 and 100 or (e->>'sets')::numeric<>trunc((e->>'sets')::numeric) then return false; end if;
   foreach k in array array['weight','rpe','rir'] loop
    if e ? k and (jsonb_typeof(e->k)<>'number' or (e->>k)::numeric<0 or (e->>k)::numeric>(case k when 'weight' then 1500 when 'rpe' then 10 else 20 end)) then return false; end if;
   end loop;
   if e ? 'rir' and (e->>'rir')::numeric<>trunc((e->>'rir')::numeric) then return false; end if;
  end loop;
 end if;
 if body ? 'meals' and not public.valid_content(jsonb_build_object('days',jsonb_build_array(jsonb_build_object('name','validation','exercises',jsonb_build_array(jsonb_build_object('name','validation','description','','video','','sets',1,'reps','1','rest',0)))),'nutrition',body-array['notes'])) then return false; end if;
 if kind in ('note','message') and length(trim(body->>'text'))=0 then return false; end if;
 return true;
 exception when others then return false;
end $$;
revoke all on function private.valid_coaching_record(text,jsonb) from public,anon;
grant execute on function private.valid_coaching_record(text,jsonb) to authenticated,coach_api;
alter table public.coaching_records add constraint coaching_payload_valid check(private.valid_coaching_record(kind,payload));

-- Narrow identity-checked writer for both coaches and their linked clients.
create function private.write_coaching_record(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); c public.clients; old public.coaching_records; rid uuid:=(body->>'id')::uuid; k text:=body->>'kind'; value jsonb:=body->'payload'; result jsonb; photo jsonb; begin
 select * into c from public.clients where id=(body->>'client_id')::uuid and not archived and (coach_id=uid or trainee_user_id=uid) for update;
 if uid is null or c.id is null then raise exception 'العميل غير متاح'; end if;
 if c.coach_id<>uid and k not in ('measurement','nutrition_log','workout_log','checkin','message') then raise exception 'هذه العملية للمدرب فقط'; end if;
 if (body->>'entry_date')::date>(now() at time zone 'Asia/Riyadh')::date and k not in ('nutrition_target','program_history') then raise exception 'لا تسجل نشاطًا في المستقبل'; end if;
 if not private.valid_coaching_record(k,value) then raise exception 'بيانات السجل غير صالحة'; end if;
 if value ? 'program_id' and not exists(select 1 from public.programs where id=(value->>'program_id')::uuid and client_id=c.id and (coach_id=uid or published_at is not null)) then raise exception 'البرنامج غير متاح'; end if;
 for photo in select x from jsonb_array_elements(coalesce(value->'photo_ids','[]')) x loop
  if not exists(select 1 from public.progress_photos where id=(photo#>>'{}')::uuid and client_id=c.id and status='ready') then raise exception 'الصورة غير متاحة لهذا العميل'; end if;
 end loop;
 select * into old from public.coaching_records where id=rid or (client_id=c.id and kind=k and source_key=coalesce(body->>'source_key',rid::text)) limit 1;
 if old.id is not null then
  if old.client_id<>c.id or old.kind<>k or old.payload<>value or old.entry_date<>(body->>'entry_date')::date then raise exception 'تعارض مع سجل سابق؛ أضف تصحيحًا منفصلًا'; end if;
  return to_jsonb(old);
 end if;
 insert into public.coaching_records(id,client_id,coach_id,kind,entry_date,payload,author_id,source_key,author_type) values(rid,c.id,c.coach_id,k,(body->>'entry_date')::date,value,uid,coalesce(body->>'source_key',rid::text),case when uid=c.coach_id and body->>'author_type'='client' then 'client' when uid=c.coach_id then 'coach' else 'client' end) returning to_jsonb(coaching_records) into result;
 return result;
end $$;
revoke all on function private.write_coaching_record(jsonb) from public,anon;
grant execute on function private.write_coaching_record(jsonb) to authenticated,coach_api;

grant create on schema private to coach_api;
create function private.management_command(command text,input_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); c public.clients; t public.templates; item jsonb; result jsonb; ids jsonb:='[]'; rid uuid; cid uuid; base jsonb; old jsonb; begin
 if uid is null then raise exception 'يلزم تسجيل الدخول'; end if;
 if command='record_save' then return private.write_coaching_record(input_data); end if;
 if command='messages_read' then return private.mark_messages_read((input_data->>'client_id')::uuid); end if;
 if command in ('photo_reserve','photo_ready') then return private.photo_command(command,input_data); end if;
 if command='preferences_save' then
  insert into public.account_preferences(user_id,language,checkin_days,weight_days,reminders,low_adherence) values(uid,input_data->>'language',(input_data->>'checkin_days')::int,(input_data->>'weight_days')::int,(input_data->>'reminders')::boolean,(input_data->>'low_adherence')::numeric) on conflict(user_id) do update set language=excluded.language,checkin_days=excluded.checkin_days,weight_days=excluded.weight_days,reminders=excluded.reminders,low_adherence=excluded.low_adherence returning to_jsonb(account_preferences) into result; return result;
 end if;
 if not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'هذه العملية للمدرب فقط'; end if;
 case command
 when 'client_archive' then
  update public.clients set archived=(input_data->>'archived')::boolean,updated_at=now() where id=(input_data->>'client_id')::uuid and coach_id=uid returning to_jsonb(clients) into result;
 when 'details_save' then
  select * into c from public.clients where id=(input_data->>'client_id')::uuid and coach_id=uid and not archived;
  if c.id is null then raise exception 'العميل غير متاح'; end if;
  item:=input_data->'details';
  if item-array['birth_date','age','gender','height','start_date','status']<>'{}'::jsonb then raise exception 'حقول غير مسموحة'; end if;
  if (item->>'birth_date')::date>(now() at time zone 'Asia/Riyadh')::date then raise exception 'تاريخ الميلاد غير صالح'; end if;
  insert into public.client_details(client_id,coach_id,birth_date,age,gender,height,start_date,status) values(c.id,uid,(item->>'birth_date')::date,(item->>'age')::int,coalesce(item->>'gender','unspecified'),(item->>'height')::numeric,(item->>'start_date')::date,coalesce(item->>'status','active')) on conflict(client_id) do update set birth_date=excluded.birth_date,age=excluded.age,gender=excluded.gender,height=excluded.height,start_date=excluded.start_date,status=excluded.status,updated_at=now() returning to_jsonb(client_details) into result;
 when 'record_review' then
  update public.coaching_records set reviewed_at=case when (input_data->>'reviewed')::boolean then now() else null end,coach_feedback=input_data->>'feedback' where id=(input_data->>'id')::uuid and coach_id=uid and kind='checkin' returning to_jsonb(coaching_records) into result;
 when 'template_meta' then
  if not exists(select 1 from public.templates where id=(input_data->>'id')::uuid and coach_id=uid) then raise exception 'القالب غير متاح'; end if;
  insert into public.template_metadata(template_id,coach_id,description,archived,kind) values((input_data->>'id')::uuid,uid,input_data->>'description',(input_data->>'archived')::boolean,input_data->>'kind') on conflict(template_id) do update set description=excluded.description,archived=excluded.archived,kind=excluded.kind returning to_jsonb(template_metadata) into result;
 when 'template_delete' then
  delete from public.templates where id=(input_data->>'id')::uuid and coach_id=uid returning jsonb_build_object('id',id) into result;
 when 'template_duplicate' then
  select * into t from public.templates where id=(input_data->>'id')::uuid and coach_id=uid;
  if t.id is null then raise exception 'القالب غير متاح'; end if;
  result:=private.app_command('template_save',jsonb_build_object('name',coalesce(input_data->>'name',left(t.name||' · نسخة',140)),'content',t.content));
  insert into public.template_metadata(template_id,coach_id,description,archived,kind) select (result->>'id')::uuid,uid,description,false,kind from public.template_metadata where template_id=t.id;
 when 'template_assign' then
  select * into t from public.templates where id=(input_data->>'id')::uuid and coach_id=uid;
  if t.id is null or exists(select 1 from public.template_metadata where template_id=t.id and archived) then raise exception 'القالب غير متاح'; end if;
  if jsonb_typeof(input_data->'clients')<>'array' or jsonb_array_length(input_data->'clients') not between 1 and 100 then raise exception 'اختر 1 إلى 100 عميل'; end if;
  if (select count(distinct x#>>'{}') from jsonb_array_elements(input_data->'clients') x)<>jsonb_array_length(input_data->'clients') then raise exception 'العميل مكرر'; end if;
  for item in select value from jsonb_array_elements(input_data->'clients') loop
   cid:=(item#>>'{}')::uuid;
   if not exists(select 1 from public.clients where id=cid and coach_id=uid and not archived) then raise exception 'عميل خارج حسابك'; end if;
   if exists(select 1 from public.programs where client_id=cid and published_at is null) and not coalesce((input_data->>'replace_drafts')::boolean,false) then raise exception 'توجد مسودة؛ اختر استبدال المسودات صراحة'; end if;
  end loop;
  for item in select value from jsonb_array_elements(input_data->'clients') loop
   cid:=(item#>>'{}')::uuid; perform id from public.clients where id=cid for update;
   base:=t.content;
   if exists(select 1 from public.template_metadata where template_id=t.id and kind='nutrition') then
    select content into base from public.programs where client_id=cid and coach_id=uid order by (published_at is null) desc,version desc limit 1;
    base:=jsonb_set(coalesce(base,t.content),'{nutrition}',t.content->'nutrition');
   end if;
   result:=private.app_command('program_save',jsonb_build_object('client_id',cid,'name',t.name,'content',base)); rid:=(result->>'id')::uuid;
   if coalesce((input_data->>'publish')::boolean,false) then perform private.app_command('program_publish',jsonb_build_object('id',rid)); end if;
   ids:=ids||jsonb_build_array(rid);
  end loop;
  result:=jsonb_build_object('assigned',jsonb_array_length(ids),'program_ids',ids);
 when 'import_data' then return private.import_management(input_data);
 when 'import_undo' then return private.undo_management_import((input_data->>'id')::uuid);
 else raise exception 'عملية غير صالحة';
 end case;
 if result is null then raise exception 'السجل غير متاح'; end if;
 return result;
end $$;
alter function private.management_command(text,jsonb) owner to coach_api;
revoke all on function private.management_command(text,jsonb) from public,anon;
grant execute on function private.management_command(text,jsonb) to authenticated;
create function public.management_command(command text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.management_command(command,payload) $$;
revoke all on function public.management_command(text,jsonb) from public,anon;
grant execute on function public.management_command(text,jsonb) to authenticated;

create function private.mark_messages_read(cid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); begin
 if not exists(select 1 from public.clients where id=cid and not archived and (coach_id=uid or trainee_user_id=uid)) then raise exception 'العميل غير متاح'; end if;
 update public.coaching_records set read_at=now() where client_id=cid and kind='message' and author_id<>uid and read_at is null;
 return '{}';
end $$;
revoke all on function private.mark_messages_read(uuid) from public,anon,authenticated;
grant execute on function private.mark_messages_read(uuid) to coach_api;

create function private.management_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 return private.studio_snapshot()||jsonb_build_object('weights',coalesce((select jsonb_agg(to_jsonb(w) order by w.entry_date) from (select distinct on (client_id,entry_date) id,client_id,entry_date,weight,updated_at from (
 select id,client_id,entry_date,weight,updated_at from public.weight_entries
 union all select id,client_id,entry_date,(payload->>'weight')::numeric,created_at from public.coaching_records where kind='measurement' and payload ? 'weight' and not coalesce((payload->>'historical_only')::boolean,false)
 ) q order by client_id,entry_date,updated_at desc) w),'[]'),'management',jsonb_build_object(
 'details',coalesce((select jsonb_agg(d) from public.client_details d),'[]'),
 'records',coalesce((select jsonb_agg(r order by entry_date desc,created_at desc) from public.coaching_records r),'[]'),
 'template_metadata',coalesce((select jsonb_agg(m) from public.template_metadata m),'[]'),
 'import_batches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'created_at',b.created_at,'status',b.status,'report',b.report)) from public.import_batches b),'[]'),
 'preferences',coalesce((select to_jsonb(p)-'user_id' from public.account_preferences p where user_id=private.session_uid()),'{"language":"ar","checkin_days":7,"weight_days":7,"reminders":true,"low_adherence":60}'),
 'progress_photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'client_id',p.client_id,'entry_date',p.entry_date,'filename',p.filename,'status',p.status)) from public.progress_photos p where status='ready'),'[]')));
end $$;
alter function private.management_snapshot() owner to coach_api;
revoke all on function private.management_snapshot() from public,anon;
grant execute on function private.management_snapshot() to authenticated;
create function public.management_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select private.management_snapshot() $$;
revoke all on function public.management_snapshot() from public,anon;
grant execute on function public.management_snapshot() to authenticated;
revoke create on schema private from coach_api;

do $$ begin
 if to_regclass('storage.buckets') is not null then
  execute 'insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(''progress-photos'',''progress-photos'',false,10485760,array[''image/jpeg'',''image/png'',''image/webp'']) on conflict(id) do nothing';
 end if;
end $$;
-- Owner writes are allowed only through the checked RPC owner role.
create policy details_owner_write on public.client_details for all to coach_api using(coach_id=(select private.session_uid())) with check(coach_id=(select private.session_uid()));
grant insert,update,delete on public.client_details to coach_api;
create policy coaching_owner_update on public.coaching_records for update to coach_api using(coach_id=(select private.session_uid())) with check(coach_id=(select private.session_uid()));
grant update on public.coaching_records to coach_api;
alter table public.coaching_records alter column author_id drop not null;
alter table public.coaching_records add column author_type text not null default 'coach' check(author_type in ('coach','client'));
alter table public.progress_photos alter column author_id drop not null;
-- Record payloads are append-only; review/read metadata is deliberately separate.
create function private.protect_record_history() returns trigger language plpgsql set search_path='' as $$ begin
 if new.payload<>old.payload or new.client_id<>old.client_id or new.coach_id<>old.coach_id or new.kind<>old.kind or new.entry_date<>old.entry_date or new.source_key<>old.source_key or new.author_id is distinct from old.author_id or new.author_type<>old.author_type then raise exception 'السجل التاريخي ثابت؛ أضف تصحيحًا جديدًا'; end if; return new;
end $$;
create trigger protect_record_history before update on public.coaching_records for each row execute function private.protect_record_history();
revoke all on function private.protect_record_history() from public,anon,authenticated;


-- Use an explicit replacement below instead of depending on author text for unread messages.
create or replace function private.mark_messages_read(cid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); begin
 if not exists(select 1 from public.clients where id=cid and not archived and (coach_id=uid or trainee_user_id=uid)) then raise exception 'العميل غير متاح'; end if;
 update public.coaching_records set read_at=now() where client_id=cid and kind='message' and author_id is distinct from uid and read_at is null;
 return '{}';
end $$;

create function private.photo_command(command text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); c public.clients; result jsonb; begin
 select * into c from public.clients where id=(payload->>'client_id')::uuid and not archived and (coach_id=uid or trainee_user_id=uid);
 if c.id is null then raise exception 'العميل غير متاح'; end if;
 if command<>'photo_reserve' then raise exception 'يلزم تأكيد الرفع من الخادم'; end if;
 if (select count(*) from public.progress_photos where client_id=c.id and created_at>now()-interval '1 day')>=30 then raise exception 'حد الصور اليومي 30'; end if;
 insert into public.progress_photos(id,client_id,coach_id,author_id,entry_date,filename,size,mime) values((payload->>'id')::uuid,c.id,c.coach_id,uid,(payload->>'entry_date')::date,payload->>'filename',(payload->>'size')::int,payload->>'mime') returning to_jsonb(progress_photos) into result;
 return result;
end $$;
revoke all on function private.photo_command(text,jsonb) from public,anon,authenticated;
grant execute on function private.photo_command(text,jsonb) to coach_api;
create function private.finalize_photo(asset uuid) returns boolean language plpgsql security definer set search_path='' as $$ begin
 update public.progress_photos set status='ready' where id=asset; return found;
end $$;
revoke all on function private.finalize_photo(uuid) from public,anon,authenticated;
create function public.finalize_photo(asset uuid) returns boolean language sql security invoker set search_path='' as $$ select private.finalize_photo(asset) $$;
revoke all on function public.finalize_photo(uuid) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant usage on schema private to service_role; grant execute on function private.finalize_photo(uuid),public.finalize_photo(uuid) to service_role; end if; end $$;

create function private.portal_management(token_hash text,proof text,command text,input_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; cid uuid; owner uuid; rid uuid; existing public.coaching_records; value jsonb; k text; result jsonb; begin
 base:=private.portal_access(token_hash,proof);
 if base ? 'error' then return base; end if;
 select client_id,coach_id into cid,owner from public.portal_links l where l.token_hash=portal_management.token_hash;
 if command='record_save' then
  k:=input_data->>'kind'; value:=input_data->'payload'; rid:=(input_data->>'id')::uuid;
  if (input_data->>'client_id')::uuid<>cid or k not in ('measurement','nutrition_log','workout_log','checkin','message') or not private.valid_coaching_record(k,value) then raise exception 'بيانات غير صالحة'; end if;
  if (input_data->>'entry_date')::date>(now() at time zone 'Asia/Riyadh')::date then raise exception 'تاريخ مستقبلي'; end if;
  if value ? 'program_id' and not exists(select 1 from public.programs where id=(value->>'program_id')::uuid and client_id=cid and published_at is not null) then raise exception 'البرنامج غير متاح'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(value->'photo_ids','[]')) x where not exists(select 1 from public.progress_photos p where p.id=x::uuid and p.client_id=cid and p.status='ready')) then raise exception 'الصورة غير متاحة'; end if;
  select * into existing from public.coaching_records where id=rid;
  if existing.id is not null then
   if existing.client_id<>cid or existing.kind<>k or existing.payload<>value or existing.entry_date<>(input_data->>'entry_date')::date then raise exception 'معرف مكرر'; end if;
  else
   insert into public.coaching_records(id,client_id,coach_id,kind,entry_date,payload,author_id,source_key,author_type) values(rid,cid,owner,k,(input_data->>'entry_date')::date,value,null,rid::text,'client');
  end if;
 elsif command='messages_read' then update public.coaching_records set read_at=now() where client_id=cid and kind='message' and author_type='coach' and read_at is null;
 elsif command='photo_reserve' then
  if (input_data->>'client_id')::uuid<>cid then raise exception 'العميل غير متاح'; end if;
  if (select count(*) from public.progress_photos where client_id=cid and created_at>now()-interval '1 day')>=30 then raise exception 'حد الصور اليومي 30'; end if;
  insert into public.progress_photos(id,client_id,coach_id,author_id,entry_date,filename,size,mime) values((input_data->>'id')::uuid,cid,owner,null,(input_data->>'entry_date')::date,input_data->>'filename',(input_data->>'size')::int,input_data->>'mime') returning to_jsonb(progress_photos) into result;
  return result;
 elsif command<>'snapshot' then raise exception 'عملية غير صالحة'; end if;
 return base||jsonb_build_object('weights',coalesce((select jsonb_agg(to_jsonb(w) order by w.entry_date) from (select distinct on (client_id,entry_date) id,client_id,entry_date,weight,updated_at from (
 select id,client_id,entry_date,weight,updated_at from public.weight_entries where client_id=cid
 union all select id,client_id,entry_date,(r.payload->>'weight')::numeric,created_at from public.coaching_records r where client_id=cid and kind='measurement' and r.payload ? 'weight' and not coalesce((r.payload->>'historical_only')::boolean,false)
 ) q order by client_id,entry_date,updated_at desc) w),'[]'),'client_id',cid,'management',jsonb_build_object(
  'details',coalesce((select jsonb_agg(d) from public.client_details d where client_id=cid),'[]'),
  'records',coalesce((select jsonb_agg(r order by entry_date desc,created_at desc) from public.coaching_records r where client_id=cid and kind<>'note'),'[]'),
  'progress_photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'client_id',p.client_id,'entry_date',p.entry_date,'filename',p.filename,'status',p.status)) from public.progress_photos p where client_id=cid and status='ready'),'[]'),
  'template_metadata','[]'::jsonb,'import_batches','[]'::jsonb,'preferences','{}'::jsonb));
end $$;
revoke all on function private.portal_management(text,text,text,jsonb) from public;
grant execute on function private.portal_management(text,text,text,jsonb) to anon,authenticated;
create function public.portal_management(token_hash text,proof text,command text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.portal_management(token_hash,proof,command,payload) $$;
revoke all on function public.portal_management(text,text,text,jsonb) from public;
grant execute on function public.portal_management(text,text,text,jsonb) to anon,authenticated;
create function private.photo_access(asset uuid,portal_hash text default null,proof text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.progress_photos; cid uuid; uid uuid:=private.session_uid(); begin
 select * into p from public.progress_photos where id=asset;
 if p.id is null then return null; end if;
 if portal_hash is not null then
  if private.portal_access(portal_hash,proof) ? 'error' then return null; end if;
  select client_id into cid from public.portal_links l where l.token_hash=portal_hash;
  if cid<>p.client_id then return null; end if;
 elsif not exists(select 1 from public.clients where id=p.client_id and not archived and (coach_id=uid or trainee_user_id=uid)) then return null;
 end if;
 return to_jsonb(p);
end $$;
revoke all on function private.photo_access(uuid,text,text) from public;
grant execute on function private.photo_access(uuid,text,text) to anon,authenticated;
create function public.photo_access(asset uuid,portal_hash text default null,proof text default null) returns jsonb language sql security invoker set search_path='' as $$ select private.photo_access(asset,portal_hash,proof) $$;
revoke all on function public.photo_access(uuid,text,text) from public;
grant execute on function public.photo_access(uuid,text,text) to anon,authenticated;

create table public.import_subscription_refs (
 client_id uuid not null, coach_id uuid not null, source_ref text not null check(length(source_ref) between 1 and 160), subscription_id uuid not null,
 primary key(client_id,source_ref), foreign key(client_id,coach_id) references public.clients(id,coach_id) on delete cascade,
 foreign key(subscription_id,coach_id) references public.subscriptions(id,coach_id)
);
alter table public.import_subscription_refs enable row level security;
create policy import_ref_owner on public.import_subscription_refs for all to coach_api using(coach_id=(select private.session_uid())) with check(coach_id=(select private.session_uid()));
grant select,insert,update,delete on public.import_subscription_refs to coach_api;
alter table public.template_metadata add column import_key text;
create unique index template_import_key on public.template_metadata(coach_id,import_key) where import_key is not null;
create policy coaching_owner_delete on public.coaching_records for delete to coach_api using(coach_id=(select private.session_uid()));
grant delete on public.coaching_records to coach_api;

grant create on schema private to coach_api;
create function private.import_management(body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); rowdata jsonb; d jsonb; v jsonb; cl public.clients; before_row jsonb; after_row jsonb;
 batch public.import_batches; changes jsonb:='[]'; created integer:=0; updated integer:=0; inserted integer:=0; skipped integer:=0; rid uuid; ref text; sub uuid; old_goal jsonb; report jsonb;
begin
 if not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'هذه العملية للمدرب فقط'; end if;
 if jsonb_typeof(body->'rows')<>'array' or jsonb_array_length(body->'rows') not between 1 and 10000 or octet_length(body::text)>4000000 then raise exception 'دفعة الاستيراد أكبر من الحد الآمن'; end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 select * into batch from public.import_batches where coach_id=uid and fingerprint=body->>'fingerprint';
 if batch.id is not null then
  if batch.status='undone' then raise exception 'هذه الدفعة ألغيت؛ غيّر الملف أو ابدأ استيرادًا جديدًا'; end if;
  return batch.report||jsonb_build_object('batch_id',batch.id,'replayed',true);
 end if;
 -- Create/update identities first; child rows may appear in any worksheet order.
 for rowdata in select value from jsonb_array_elements(body->'rows') where value->>'category'='clients' loop
  d:=rowdata->'data'; v:=rowdata->'values';
  select * into cl from public.clients where coach_id=uid and email=lower(rowdata->>'email') for update;
  before_row:=case when cl.id is null then null else to_jsonb(cl) end;
  if cl.id is null then
   after_row:=private.app_command('client_save',d->'client'); created:=created+1;
   cl.id:=(after_row->>'id')::uuid;
   changes:=changes||jsonb_build_array(jsonb_build_object('table','clients','id',cl.id,'before',null,'after',after_row));
  elsif body->>'mode'='merge' then
   if cl.archived then raise exception 'عميل مؤرشف؛ أعد تفعيله قبل تحديثه'; end if;
   after_row:=private.app_command('client_save',(d->'client')||jsonb_build_object('id',cl.id)); updated:=updated+1;
   changes:=changes||jsonb_build_array(jsonb_build_object('table','clients','id',cl.id,'before',before_row,'after',after_row));
  else skipped:=skipped+1;
  end if;
  if d->'details'<>'{}'::jsonb and (before_row is null or body->>'mode'='merge') then
   select to_jsonb(x) into before_row from public.client_details x where client_id=cl.id;
   after_row:=private.management_command('details_save',jsonb_build_object('client_id',cl.id,'details',(coalesce(before_row,'{}')-array['client_id','coach_id','updated_at'])||(d->'details')));
   changes:=changes||jsonb_build_array(jsonb_build_object('table','client_details','id',cl.id,'before',before_row,'after',after_row));
  end if;
 end loop;
 for rowdata in select value from jsonb_array_elements(body->'rows') where value->>'category'<>'clients' order by case value->>'category' when 'subscriptions' then 0 when 'payments' then 2 else 1 end loop
  d:=rowdata->'data'; v:=rowdata->'values';
  if rowdata->>'category'='templates' then
   if exists(select 1 from public.template_metadata where coach_id=uid and import_key=rowdata->>'source_key') then skipped:=skipped+1; continue; end if;
   after_row:=private.app_command('template_save',jsonb_build_object('name',d->'payload'->>'name','content',d->'payload'->'content'));
   rid:=(after_row->>'id')::uuid;
   perform private.management_command('template_meta',jsonb_build_object('id',rid,'description',coalesce(v->>'description',''),'archived',coalesce((v->>'archived')::boolean,false),'kind',coalesce(nullif(v->>'template_kind',''),'workout')));
   update public.template_metadata set import_key=rowdata->>'source_key' where template_id=rid;
   changes:=changes||jsonb_build_array(jsonb_build_object('table','templates','id',rid,'before',null,'after',after_row));
   select to_jsonb(m) into report from public.template_metadata m where template_id=rid;
   changes:=changes||jsonb_build_array(jsonb_build_object('table','template_metadata','id',rid,'before',null,'after',report)); inserted:=inserted+1; continue;
  end if;
  select * into cl from public.clients where coach_id=uid and email=lower(rowdata->>'email') and not archived;
  if cl.id is null then raise exception 'صف تاريخي بلا عميل مطابق: %',rowdata->>'email'; end if;
  if rowdata->>'category'='subscriptions' then
   ref:=coalesce(nullif(v->>'subscription_ref',''),rowdata->>'source_key');
   if exists(select 1 from public.import_subscription_refs where client_id=cl.id and source_ref=ref) then skipped:=skipped+1; continue; end if;
   after_row:=private.app_command('subscription_create',jsonb_build_object('client_id',cl.id,'name',coalesce(nullif(v->>'name',''),'اشتراك مستورد'),'start_date',v->>'start_date','end_date',v->>'end_date','price',(v->>'price')::numeric));
   insert into public.import_subscription_refs(client_id,coach_id,source_ref,subscription_id) values(cl.id,uid,ref,(after_row->>'id')::uuid);
   changes:=changes||jsonb_build_array(jsonb_build_object('table','subscriptions','id',after_row->>'id','before',null,'after',after_row)); inserted:=inserted+1;
  elsif rowdata->>'category'='payments' then
   select subscription_id into sub from public.import_subscription_refs where client_id=cl.id and source_ref=v->>'subscription_ref';
   if sub is null then raise exception 'مرجع الاشتراك غير موجود للدفعة'; end if;
   ref:=coalesce(nullif(v->>'reference',''),'import-'||(rowdata->>'source_key'));
   if exists(select 1 from public.payments where coach_id=uid and lower(reference)=lower(ref) and kind='payment') then
    if exists(select 1 from public.payments where coach_id=uid and lower(reference)=lower(ref) and subscription_id=sub and amount=(v->>'amount')::numeric and paid_date=(v->>'date')::date and method=v->>'method') then skipped:=skipped+1; continue; end if;
    raise exception 'مرجع دفعة يتعارض مع سجل موجود';
   end if;
   after_row:=private.app_command('payment_add',jsonb_build_object('id',gen_random_uuid(),'subscription_id',sub,'amount',(v->>'amount')::numeric,'method',v->>'method','paid_date',v->>'date','reference',ref));
   changes:=changes||jsonb_build_array(jsonb_build_object('table','payments','id',after_row->>'id','before',null,'after',after_row)); inserted:=inserted+1;
  elsif d->>'kind' is not null then
   if exists(select 1 from public.coaching_records where client_id=cl.id and kind=d->>'kind' and source_key=rowdata->>'source_key') then
    if not exists(select 1 from public.coaching_records where client_id=cl.id and kind=d->>'kind' and source_key=rowdata->>'source_key' and payload=d->'payload' and entry_date=(d->>'entry_date')::date) then raise exception 'معرف المصدر يتعارض مع سجل سابق؛ أضف تصحيحًا بمعرف جديد'; end if;
    skipped:=skipped+1; continue;
   end if;
   rid:=gen_random_uuid();
   after_row:=private.write_coaching_record(jsonb_build_object('id',rid,'client_id',cl.id,'kind',d->>'kind','entry_date',d->>'entry_date','payload',d->'payload','source_key',rowdata->>'source_key','author_type',v->>'author_type'));
   if d->>'kind'='checkin' and coalesce((v->>'reviewed')::boolean,false) then
    update public.coaching_records set reviewed_at=now(),coach_feedback=coalesce(v->>'coach_feedback','') where id=rid returning to_jsonb(coaching_records) into after_row;
   end if;
   if d->>'kind'='goal_history' and not exists(select 1 from jsonb_array_elements(body->'rows') x where x->>'email'=rowdata->>'email' and x->'data'->>'kind'='goal_history' and (x->'data'->>'entry_date'>d->>'entry_date' or (x->'data'->>'entry_date'=d->>'entry_date' and x->>'source_key'>rowdata->>'source_key'))) and (body->>'mode'='merge' or not exists(select 1 from public.client_goals where client_id=cl.id)) then
    select to_jsonb(g) into old_goal from public.client_goals g where client_id=cl.id;
    report:=private.app_command('goal_save',(d->'payload')||jsonb_build_object('client_id',cl.id,'notes',coalesce(v->>'notes','')));
    changes:=changes||jsonb_build_array(jsonb_build_object('table','client_goals','id',cl.id,'before',old_goal,'after',report));
   end if;
   changes:=changes||jsonb_build_array(jsonb_build_object('table','coaching_records','id',rid,'before',null,'after',after_row)); inserted:=inserted+1;
  else raise exception 'نوع صف غير مدعوم'; end if;
 end loop;
 report:=jsonb_build_object('clients_created',created,'clients_updated',updated,'records_inserted',inserted,'skipped',skipped,'source_rows',jsonb_array_length(body->'rows'),'reversible',not exists(select 1 from jsonb_array_elements(changes) x where x->>'table' in ('payments','subscriptions')));
 insert into public.import_batches(id,coach_id,fingerprint,report,changes) values((body->>'id')::uuid,uid,body->>'fingerprint',report,changes);
 return report||jsonb_build_object('batch_id',body->>'id');
end $$;
alter function private.import_management(jsonb) owner to coach_api;
revoke all on function private.import_management(jsonb) from public,anon,authenticated;
grant execute on function private.import_management(jsonb) to coach_api;

create function private.undo_management_import(batch_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); b public.import_batches; change jsonb; current_row jsonb; rid uuid; before_row jsonb; begin
 perform pg_advisory_xact_lock(hashtext(uid::text));
 select * into b from public.import_batches where id=batch_id and coach_id=uid for update;
 if b.id is null or b.status<>'applied' then raise exception 'الدفعة غير متاحة للتراجع'; end if;
 if exists(select 1 from jsonb_array_elements(b.changes) x where x->>'table' in ('payments','subscriptions')) then raise exception 'دفتر مالي ثابت: صحح الدفعات بحركة عكس موثقة؛ لا نحذفها بالتراجع'; end if;
 -- Check every affected row before changing anything. Any conflict rolls back the entire undo.
 for change in select value from jsonb_array_elements(b.changes) loop
  rid:=(change->>'id')::uuid;
  case change->>'table'
   when 'clients' then select to_jsonb(c) into current_row from public.clients c where id=rid and coach_id=uid;
   when 'client_details' then select to_jsonb(c) into current_row from public.client_details c where client_id=rid and coach_id=uid;
   when 'client_goals' then select to_jsonb(c) into current_row from public.client_goals c where client_id=rid and coach_id=uid;
   when 'coaching_records' then select to_jsonb(c) into current_row from public.coaching_records c where id=rid and coach_id=uid;
   when 'templates' then select to_jsonb(c) into current_row from public.templates c where id=rid and coach_id=uid;
   when 'template_metadata' then select to_jsonb(c) into current_row from public.template_metadata c where template_id=rid and coach_id=uid;
   else raise exception 'نوع غير قابل للتراجع';
  end case;
  if current_row is distinct from change->'after' then raise exception 'تعدلت بيانات بعد الاستيراد؛ أوقفنا التراجع لحمايتها'; end if;
 end loop;
 for change in select value from jsonb_array_elements(b.changes) with ordinality x(value,n) order by n desc loop
  rid:=(change->>'id')::uuid; before_row:=change->'before';
  case change->>'table'
   when 'coaching_records' then delete from public.coaching_records where id=rid and coach_id=uid;
   when 'templates' then delete from public.templates where id=rid and coach_id=uid;
   when 'template_metadata' then delete from public.template_metadata where template_id=rid and coach_id=uid;
   when 'client_details' then
    if before_row='null'::jsonb then delete from public.client_details where client_id=rid and coach_id=uid;
    else update public.client_details set birth_date=(before_row->>'birth_date')::date,age=(before_row->>'age')::int,gender=before_row->>'gender',height=(before_row->>'height')::numeric,start_date=(before_row->>'start_date')::date,status=before_row->>'status',updated_at=(before_row->>'updated_at')::timestamptz where client_id=rid and coach_id=uid; end if;
   when 'client_goals' then
    if before_row='null'::jsonb then delete from public.client_goals where client_id=rid and coach_id=uid;
    else update public.client_goals set goal=before_row->>'goal',target_weight=(before_row->>'target_weight')::numeric,focus=before_row->>'focus',notes=before_row->>'notes',updated_at=(before_row->>'updated_at')::timestamptz where client_id=rid and coach_id=uid; end if;
   when 'clients' then
    if before_row='null'::jsonb then
     if exists(select 1 from public.programs where client_id=rid) or exists(select 1 from public.subscriptions where client_id=rid) or exists(select 1 from public.coaching_records where client_id=rid) or exists(select 1 from public.weight_entries where client_id=rid) or exists(select 1 from public.progress_photos where client_id=rid) or exists(select 1 from public.invitations where client_id=rid) or exists(select 1 from public.portal_links where client_id=rid) then raise exception 'للعميل نشاط أحدث؛ لا نحذفه بالتراجع'; end if;
     delete from public.clients where id=rid and coach_id=uid;
    else update public.clients set name=before_row->>'name',phone=before_row->>'phone',updated_at=(before_row->>'updated_at')::timestamptz where id=rid and coach_id=uid; end if;
  end case;
 end loop;
 update public.import_batches set status='undone' where id=b.id;
 return jsonb_build_object('undone',true,'batch_id',b.id);
end $$;
alter function private.undo_management_import(uuid) owner to coach_api;
revoke all on function private.undo_management_import(uuid) from public,anon,authenticated;
grant execute on function private.undo_management_import(uuid) to coach_api;

-- Preserve explicit corrections made through the legacy daily-weight and goal forms.
create function private.preserve_coaching_history() returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); body jsonb; k text; source text; begin
 if tg_table_name='weight_entries' then
  if tg_op='UPDATE' and new.weight=old.weight then return new; end if;
  body:=jsonb_build_object('weight',old.weight,'historical_only',true,'notes','قيمة محفوظة قبل تصحيح أو حذف التسجيل اليومي'); k:='measurement'; source:='weight:'||old.id::text||':'||old.updated_at::text;
  insert into public.coaching_records(id,client_id,coach_id,kind,entry_date,payload,author_id,source_key,author_type,created_at) values(gen_random_uuid(),old.client_id,old.coach_id,k,old.entry_date,body,uid,source,case when uid=old.coach_id then 'coach' else 'client' end,old.updated_at) on conflict(client_id,kind,source_key) do nothing;
 elsif tg_table_name='client_goals' then
  if new.goal=old.goal and new.target_weight is not distinct from old.target_weight and new.focus=old.focus and new.notes=old.notes then return new; end if;
  body:=jsonb_build_object('goal',old.goal,'target_weight',old.target_weight,'focus',old.focus); source:='goal:'||old.client_id::text||':'||old.updated_at::text;
  insert into public.coaching_records(id,client_id,coach_id,kind,entry_date,payload,author_id,source_key,author_type,created_at) values(gen_random_uuid(),old.client_id,old.coach_id,'goal_history',(old.updated_at at time zone 'Asia/Riyadh')::date,body,uid,source,'coach',old.updated_at) on conflict(client_id,kind,source_key) do nothing;
  if old.notes<>'' and new.notes<>old.notes then
   insert into public.coaching_records(id,client_id,coach_id,kind,entry_date,payload,author_id,source_key,author_type,created_at) values(gen_random_uuid(),old.client_id,old.coach_id,'note',(old.updated_at at time zone 'Asia/Riyadh')::date,jsonb_build_object('text',old.notes),uid,source||':notes','coach',old.updated_at) on conflict(client_id,kind,source_key) do nothing;
  end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.preserve_coaching_history() from public,anon,authenticated;
create trigger preserve_weight_history before update or delete on public.weight_entries for each row execute function private.preserve_coaching_history();
create trigger preserve_goal_history before update on public.client_goals for each row execute function private.preserve_coaching_history();

revoke create on schema private from coach_api;

-- Archiving is reversible. Erasure is restricted to a pending, explicitly fulfilled deletion request.
create or replace function private.client_studio_cleanup() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.email is distinct from old.email or new.archived then update public.portal_links set revoked_at=now() where client_id=new.id and revoked_at is null; end if;
 if new.archived and new.email=new.id::text||'@deleted.invalid' and exists(select 1 from public.privacy_requests where client_id=new.id and kind='deletion' and status='pending') then
  delete from public.weight_entries where client_id=new.id;
  delete from public.client_goals where client_id=new.id;
  delete from public.client_details where client_id=new.id;
  delete from public.coaching_records where client_id=new.id;
  delete from public.progress_photos where client_id=new.id;
  update public.import_batches b set changes=coalesce((select jsonb_agg(x) from jsonb_array_elements(b.changes) x where x->>'id'<>new.id::text and coalesce(x->'after'->>'client_id','')<>new.id::text and coalesce(x->'before'->>'client_id','')<>new.id::text),'[]'::jsonb) where coach_id=new.coach_id;
 end if;
 return new;
end $$;
