-- Additive studio upgrade: no existing client/program/payment data is removed.
grant create on schema private to coach_api;
create table public.client_goals (
 client_id uuid primary key, coach_id uuid not null, goal text not null default '' check(length(goal)<=100),
 target_weight numeric(5,1) check(target_weight between 20 and 400), focus text not null default '' check(length(focus)<=200),
 notes text not null default '' check(length(notes)<=2000), updated_at timestamptz not null default now(),
 foreign key(client_id,coach_id) references public.clients(id,coach_id)
);
create table public.weight_entries (
 id uuid primary key default gen_random_uuid(), client_id uuid not null, coach_id uuid not null,
 entry_date date not null, weight numeric(5,1) not null check(weight between 20 and 400),
 updated_at timestamptz not null default now(), unique(client_id,entry_date),
 foreign key(client_id,coach_id) references public.clients(id,coach_id)
);
create table public.portal_links (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null, client_id uuid not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'), proof_hash text not null check(proof_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null default now()+interval '180 days', revoked_at timestamptz,
 attempts integer not null default 0, attempt_window timestamptz not null default now(), last_opened_at timestamptz,
 foreign key(client_id,coach_id) references public.clients(id,coach_id)
);
create unique index one_live_portal on public.portal_links(client_id) where revoked_at is null;
create table public.media_assets (
 id uuid primary key, coach_id uuid not null references public.profiles(id),
 filename text not null check(length(filename) between 1 and 160), path text not null unique,
 size bigint not null check(size between 1 and 52428800), mime text not null check(mime in ('video/mp4','video/webm','video/quicktime')),
 status text not null default 'pending' check(status in ('pending','ready')), created_at timestamptz not null default now()
);
create table public.upload_sessions (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'), coach_id uuid not null references public.profiles(id),
 asset_id uuid unique references public.media_assets(id), expires_at timestamptz not null default now()+interval '15 minutes',
 filename text, size bigint, mime text, created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['client_goals','weight_entries','portal_links','media_assets','upload_sessions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy coach_select on public.%I for select to authenticated,coach_api using(coach_id=(select private.session_uid()))',t);
  execute format('create policy coach_insert on public.%I for insert to coach_api with check(coach_id=(select private.session_uid()))',t);
  execute format('create policy coach_update on public.%I for update to coach_api using(coach_id=(select private.session_uid())) with check(coach_id=(select private.session_uid()))',t);
  execute format('create policy coach_delete on public.%I for delete to coach_api using(coach_id=(select private.session_uid()))',t);
  execute format('grant select,insert,update,delete on public.%I to coach_api',t);
 end loop;
end $$;
-- Hashes and upload capabilities are never exposed by table SELECT.
grant select on public.client_goals,public.weight_entries,public.media_assets to authenticated;
alter policy coach_select on public.weight_entries using(coach_id=(select private.session_uid()) or exists(select 1 from public.clients c where c.id=client_id and c.trainee_user_id=(select private.session_uid()) and not c.archived));
alter policy coach_select on public.client_goals using(coach_id=(select private.session_uid()) or exists(select 1 from public.clients c where c.id=client_id and c.trainee_user_id=(select private.session_uid()) and not c.archived));
create index weight_owner_date on public.weight_entries(coach_id,client_id,entry_date desc);
create index media_coach on public.media_assets(coach_id);
create index portal_coach on public.portal_links(coach_id);
create index upload_coach on public.upload_sessions(coach_id);

-- Preserve validation for legacy plans and validate every optional new field.
do $$ declare definition text; begin
 select pg_get_functiondef('public.valid_content(jsonb)'::regprocedure) into definition;
 execute replace(definition,'public.valid_content','private.valid_content_v1');
end $$;
create or replace function public.valid_content(body jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare clean jsonb:=body; days jsonb:='[]'; d jsonb; e jsonb; exercises jsonb; m jsonb; begin
 if jsonb_typeof(body->'days')<>'array' then return false; end if;
 for d in select value from jsonb_array_elements(body->'days') loop
  exercises:='[]';
  for e in select value from jsonb_array_elements(d->'exercises') loop
   if e ? 'catalogId' and (jsonb_typeof(e->'catalogId')<>'string' or length(e->>'catalogId')>160) then return false; end if;
   if e ? 'mediaId' and (e->>'mediaId') !~ '^[a-f0-9-]{36}$' then return false; end if;
   if e ? 'rowId' and (e->>'rowId') !~ '^[a-f0-9-]{36}$' then return false; end if;
   exercises:=exercises||jsonb_build_array(e-array['catalogId','mediaId','rowId']);
  end loop;
  days:=days||jsonb_build_array(jsonb_set(d,'{exercises}',exercises));
 end loop;
 clean:=jsonb_set(clean,'{days}',days);
 if body->'nutrition' ? 'meals' then
  if jsonb_typeof(body->'nutrition'->'meals')<>'array' or jsonb_array_length(body->'nutrition'->'meals')>12 then return false; end if;
  for m in select value from jsonb_array_elements(body->'nutrition'->'meals') loop
   if not(m ?& array['name','time','foods','calories','protein','carbs','fat']) or m-array['name','time','foods','calories','protein','carbs','fat']<>'{}'::jsonb or jsonb_typeof(m->'name')<>'string' or length(m->>'name') not between 1 and 100 or jsonb_typeof(m->'time')<>'string' or length(m->>'time')>40 or jsonb_typeof(m->'foods')<>'string' or length(m->>'foods')>2000 then return false; end if;
   if jsonb_typeof(m->'calories')<>'number' or jsonb_typeof(m->'protein')<>'number' or jsonb_typeof(m->'carbs')<>'number' or jsonb_typeof(m->'fat')<>'number' or (m->>'calories')::numeric not between 0 and 10000 or (m->>'protein')::numeric not between 0 and 1000 or (m->>'carbs')::numeric not between 0 and 1000 or (m->>'fat')::numeric not between 0 and 1000 then return false; end if;
  end loop;
  clean:=jsonb_set(clean,'{nutrition}',(clean->'nutrition')-'meals');
 end if;
 return private.valid_content_v1(clean);
 exception when others then return false;
end $$;
grant execute on function private.valid_content_v1(jsonb) to authenticated,coach_api;

alter function private.app_command(text,jsonb) rename to app_command_v1;
create function private.app_command(command text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); cid uuid; result jsonb; e jsonb; begin
 if uid is null then raise exception 'يلزم تسجيل الدخول'; end if;
 if command in ('weight_save','weight_delete') then
  select id into cid from public.clients where id=(payload->>'client_id')::uuid and not archived and (coach_id=uid or trainee_user_id=uid);
  -- A linked trainee writes through a narrow, explicitly checked helper below.
  if cid is null then raise exception 'العميل غير متاح'; end if;
  return private.save_weight(cid,(payload->>'entry_date')::date,(payload->>'weight')::numeric,command='weight_delete');
 end if;
 if not exists(select 1 from public.profiles where id=uid and role='coach') then return private.app_command_v1(command,payload); end if;
 if command in ('program_save','template_save') then
  for e in select x from jsonb_array_elements(payload->'content'->'days') d cross join lateral jsonb_array_elements(d->'exercises') x loop
   if e ? 'mediaId' and not exists(select 1 from public.media_assets where id=(e->>'mediaId')::uuid and coach_id=uid and status='ready') then raise exception 'الفيديو غير جاهز أو لا يتبع حسابك'; end if;
  end loop;
 end if;
 case command
 when 'goal_save' then
  cid:=(payload->>'client_id')::uuid;
  if not exists(select 1 from public.clients where id=cid and coach_id=uid and not archived) then raise exception 'العميل غير متاح'; end if;
  insert into public.client_goals(client_id,coach_id,goal,target_weight,focus,notes) values(cid,uid,payload->>'goal',(payload->>'target_weight')::numeric,payload->>'focus',payload->>'notes') on conflict(client_id) do update set goal=excluded.goal,target_weight=excluded.target_weight,focus=excluded.focus,notes=excluded.notes,updated_at=now() returning to_jsonb(client_goals) into result;
 when 'portal_create' then
  cid:=(payload->>'client_id')::uuid;
  if not exists(select 1 from public.clients where id=cid and coach_id=uid and not archived) then raise exception 'العميل غير متاح'; end if;
  perform id from public.clients where id=cid for update;
  update public.portal_links set revoked_at=now() where client_id=cid and revoked_at is null;
  insert into public.portal_links(coach_id,client_id,token_hash,proof_hash) values(uid,cid,payload->>'token_hash',payload->>'proof_hash') returning jsonb_build_object('id',id) into result;
 when 'portal_revoke' then
  update public.portal_links set revoked_at=now() where client_id=(payload->>'client_id')::uuid and coach_id=uid and revoked_at is null;
  result:='{}';
 when 'media_reserve' then
  if (select count(*) from public.media_assets where coach_id=uid and created_at>now()-interval '1 day')>=100 then raise exception 'وصلت لحد 100 فيديو يوميًا'; end if;
  insert into public.media_assets(id,coach_id,filename,path,size,mime) values((payload->>'id')::uuid,uid,payload->>'filename',uid::text||'/'||(payload->>'id'),(payload->>'size')::bigint,payload->>'mime') returning to_jsonb(media_assets) into result;
 when 'media_ready' then
  update public.media_assets set status='ready' where id=(payload->>'id')::uuid and coach_id=uid returning to_jsonb(media_assets) into result;
 when 'upload_session' then
  insert into public.upload_sessions(token_hash,coach_id) values(payload->>'token_hash',uid); result:='{}';
 else
  result:=private.app_command_v1(command,payload);
 end case;
 return result;
end $$;
alter function private.app_command(text,jsonb) owner to coach_api;
revoke all on function private.app_command(text,jsonb) from public,anon;
grant execute on function private.app_command(text,jsonb) to authenticated;
-- Refresh thin wrapper to resolve the new implementation after rename.
create or replace function public.app_command(command text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.app_command(command,payload) $$;

create function private.save_weight(cid uuid,day date,value numeric,remove boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare cl public.clients; begin
 select * into cl from public.clients where id=cid and not archived and (coach_id=private.session_uid() or trainee_user_id=private.session_uid());
 if cl.id is null then raise exception 'غير مسموح'; end if;
 if day>(now() at time zone 'Asia/Riyadh')::date or day<(now() at time zone 'Asia/Riyadh')::date-365 then raise exception 'اختر يومًا خلال السنة الماضية'; end if;
 if remove then delete from public.weight_entries where client_id=cid and entry_date=day; return '{}'; end if;
 insert into public.weight_entries(client_id,coach_id,entry_date,weight) values(cid,cl.coach_id,day,value) on conflict(client_id,entry_date) do update set weight=excluded.weight,updated_at=now();
 return jsonb_build_object('saved',true);
end $$;
revoke all on function private.save_weight(uuid,date,numeric,boolean) from public,anon,authenticated;
grant execute on function private.save_weight(uuid,date,numeric,boolean) to coach_api;

-- Only these functions access anonymous capabilities; every path validates the token,
-- proof, expiry, revocation and active client before returning a minimal projection.
create function private.portal_access(token_hash text,proof text,day date default null,value numeric default null,remove boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare link public.portal_links; cl public.clients; p public.programs; begin
 select * into link from public.portal_links l where l.token_hash=portal_access.token_hash for update;
 if link.id is null or link.revoked_at is not null or link.expires_at<now() then return jsonb_build_object('error','الرابط غير متاح. اطلب رابطًا جديدًا من مدربك'); end if;
 if link.attempt_window<now()-interval '15 minutes' then link.attempts:=0; update public.portal_links set attempts=0,attempt_window=now() where id=link.id; end if;
 if link.attempts>=10 then return jsonb_build_object('error','محاولات كثيرة. انتظر 15 دقيقة'); end if;
 if proof is distinct from link.proof_hash then update public.portal_links set attempts=attempts+1 where id=link.id; return jsonb_build_object('error','رمز الدخول غير صحيح'); end if;
 select * into cl from public.clients where id=link.client_id and not archived;
 if cl.id is null then return jsonb_build_object('error','الرابط غير متاح'); end if;
 update public.portal_links set last_opened_at=now(),attempts=0 where id=link.id;
 if day is not null then
  if day>(now() at time zone 'Asia/Riyadh')::date or day<(now() at time zone 'Asia/Riyadh')::date-365 then return jsonb_build_object('error','اختر يومًا خلال السنة الماضية'); end if;
  if remove then delete from public.weight_entries where client_id=cl.id and entry_date=day;
  else
   if value is null or value not between 20 and 400 then return jsonb_build_object('error','الوزن بين 20 و400 كجم'); end if;
   insert into public.weight_entries(client_id,coach_id,entry_date,weight) values(cl.id,cl.coach_id,day,value) on conflict(client_id,entry_date) do update set weight=excluded.weight,updated_at=now();
  end if;
 end if;
 select * into p from public.programs where client_id=cl.id and published_at is not null order by published_at desc,version desc limit 1;
 return jsonb_build_object('name',cl.name,'coach',(select name from public.profiles where id=cl.coach_id),'program',case when p.id is null then null else to_jsonb(p)-array['coach_id','client_id'] end,'goal',(select to_jsonb(g)-array['coach_id','notes'] from public.client_goals g where client_id=cl.id),'weights',coalesce((select jsonb_agg(w order by w.entry_date) from (select id,client_id,entry_date,weight,updated_at from public.weight_entries where client_id=cl.id order by entry_date desc limit 365) w),'[]'));
end $$;
revoke all on function private.portal_access(text,text,date,numeric,boolean) from public;
grant execute on function private.portal_access(text,text,date,numeric,boolean) to anon,authenticated;
create function public.portal_access(token_hash text,proof text,day date default null,value numeric default null,remove boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select private.portal_access(token_hash,proof,day,value,remove) $$;
revoke all on function public.portal_access(text,text,date,numeric,boolean) from public;
grant execute on function public.portal_access(text,text,date,numeric,boolean) to anon,authenticated;

create function private.studio_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 return public.app_snapshot()||jsonb_build_object(
 'weights',coalesce((select jsonb_agg(w order by entry_date) from public.weight_entries w),'[]'),
 'client_goals',coalesce((select jsonb_agg(g) from public.client_goals g),'[]'),
 'media_assets',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'filename',m.filename,'size',m.size,'status',m.status,'created_at',m.created_at)) from public.media_assets m),'[]'),
 'portal_links',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'client_id',l.client_id,'revoked_at',l.revoked_at,'expires_at',l.expires_at,'last_opened_at',l.last_opened_at)) from public.portal_links l),'[]'));
end $$;
alter function private.studio_snapshot() owner to coach_api;
grant execute on function public.app_snapshot() to coach_api;
do $$ declare definition text; begin
 select pg_get_functiondef('public.app_snapshot()'::regprocedure) into definition;
 execute replace(definition,'auth.uid()','private.session_uid()');
end $$;
revoke all on function private.studio_snapshot() from public,anon;
grant execute on function private.studio_snapshot() to authenticated;
create function public.studio_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select private.studio_snapshot() $$;
revoke all on function public.studio_snapshot() from public,anon;
grant execute on function public.studio_snapshot() to authenticated;

create function private.media_access(asset uuid,portal_hash text default null,proof text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.media_assets; cid uuid; p jsonb; begin
 select * into m from public.media_assets where id=asset;
 if m.id is null then raise exception 'الفيديو غير متاح'; end if;
 if m.coach_id=private.session_uid() then return to_jsonb(m); end if;
 if m.status<>'ready' then raise exception 'الفيديو غير متاح'; end if;
 if portal_hash is not null then
  select l.client_id into cid from public.portal_links l join public.clients c on c.id=l.client_id where l.token_hash=portal_hash and l.proof_hash=proof and l.revoked_at is null and l.expires_at>now() and not c.archived;
 else
  select id into cid from public.clients where trainee_user_id=private.session_uid() and coach_id=m.coach_id and not archived;
 end if;
 if cid is null then raise exception 'الفيديو غير متاح'; end if;
 select content into p from public.programs where client_id=cid and published_at is not null order by published_at desc,version desc limit 1;
 if not exists(select 1 from jsonb_array_elements(p->'days') d cross join lateral jsonb_array_elements(d->'exercises') e where e->>'mediaId'=asset::text) then raise exception 'الفيديو غير متاح'; end if;
 return to_jsonb(m)-'coach_id';
end $$;
revoke all on function private.media_access(uuid,text,text) from public;
grant execute on function private.media_access(uuid,text,text) to anon,authenticated;
create function public.media_access(asset uuid,portal_hash text default null,proof text default null) returns jsonb language sql security invoker set search_path='' as $$ select private.media_access(asset,portal_hash,proof) $$;
revoke all on function public.media_access(uuid,text,text) from public;
grant execute on function public.media_access(uuid,text,text) to anon,authenticated;

create function private.upload_access(token_hash text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.upload_sessions; m public.media_assets; object_exists boolean; begin
 select * into s from public.upload_sessions u where u.token_hash=upload_access.token_hash and expires_at>now() for update;
 if s.token_hash is null then raise exception 'انتهى رابط الرفع. افتح QR جديدًا من الكمبيوتر'; end if;
 if payload ? 'filename' and s.asset_id is null then
  if (select count(*) from public.media_assets where coach_id=s.coach_id and created_at>now()-interval '1 day')>=100 then raise exception 'وصلت لحد الفيديو اليومي'; end if;
  insert into public.media_assets(id,coach_id,filename,path,size,mime) values(gen_random_uuid(),s.coach_id,left(payload->>'filename',160),s.coach_id::text||'/'||gen_random_uuid()::text,(payload->>'size')::bigint,payload->>'mime') returning * into m;
  update public.upload_sessions set asset_id=m.id where upload_sessions.token_hash=s.token_hash;
 else select * into m from public.media_assets where id=s.asset_id;
 end if;
 if payload->>'complete'='true' and m.id is not null then
  if to_regclass('storage.objects') is not null then
   execute 'select exists(select 1 from storage.objects where bucket_id=''coach-videos'' and name=$1 and (metadata->>''size'')::bigint=$2)' into object_exists using m.path,m.size;
   if not object_exists then raise exception 'لم يكتمل رفع الملف بعد'; end if;
  end if;
  update public.media_assets set status='ready' where id=m.id returning * into m;
 end if;
 return jsonb_build_object('asset',case when m.id is null then null else to_jsonb(m) end,'expires_at',s.expires_at);
end $$;
revoke all on function private.upload_access(text,jsonb) from public;
grant execute on function private.upload_access(text,jsonb) to anon,authenticated;
create function public.upload_access(token_hash text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.upload_access(token_hash,payload) $$;
revoke all on function public.upload_access(text,jsonb) from public;
grant execute on function public.upload_access(text,jsonb) to anon,authenticated;

create function private.client_studio_cleanup() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.email is distinct from old.email or new.archived then update public.portal_links set revoked_at=now() where client_id=new.id and revoked_at is null; end if;
 if new.archived and not old.archived then delete from public.weight_entries where client_id=new.id; delete from public.client_goals where client_id=new.id; end if;
 return new;
end $$;
revoke all on function private.client_studio_cleanup() from public,anon,authenticated;
create trigger client_studio_cleanup after update on public.clients for each row execute function private.client_studio_cleanup();
create trigger weight_audit after insert or update or delete on public.weight_entries for each row execute function public.log_change();
create trigger goal_audit after insert or update or delete on public.client_goals for each row execute function public.log_change();

-- The same migration works with PGlite (which has no Storage schema).
do $$ begin
 if to_regclass('storage.buckets') is not null then
  execute 'insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(''coach-videos'',''coach-videos'',false,52428800,array[''video/mp4'',''video/webm'',''video/quicktime'']) on conflict(id) do nothing';
  execute 'create policy easycoach_video_insert on storage.objects for insert to authenticated with check(bucket_id=''coach-videos'' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.profiles where id=(select auth.uid()) and role=''coach''))';
  execute 'create policy easycoach_video_select on storage.objects for select to authenticated using(bucket_id=''coach-videos'' and (storage.foldername(name))[1]=(select auth.uid())::text)';
 end if;
end $$;
revoke create on schema private from coach_api;
