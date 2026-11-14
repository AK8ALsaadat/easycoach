create function private.ec_client_open(owner uuid,target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select a.mode='legacy' or p.client_limit is null or
  (case when a.selected_clients is not null then target=any(a.selected_clients)
   else (select count(*) from public.clients where coach_id=owner and not archived)<=p.client_limit end)
 from public.ec_accounts a join public.ec_plans p on p.code=private.ec_plan(owner) where a.owner_id=owner),false)
$$;
create function private.ec_template_open(owner uuid,target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select a.mode='legacy' or p.template_limit is null or
  (case when a.selected_templates is not null then target=any(a.selected_templates)
   else (select count(*) from public.templates t where coach_id=owner and not exists(select 1 from public.template_metadata m where m.template_id=t.id and m.archived))<=p.template_limit end)
 from public.ec_accounts a join public.ec_plans p on p.code=private.ec_plan(owner) where a.owner_id=owner),false)
$$;
create function private.ec_guard_client_data() returns trigger language plpgsql security definer set search_path='' as $$
declare rowdata jsonb:=to_jsonb(new); target uuid; begin
 if rowdata ? 'client_id' then target:=(rowdata->>'client_id')::uuid;
 elsif rowdata ? 'subscription_id' then select client_id into target from public.subscriptions where id=(rowdata->>'subscription_id')::uuid;
 end if;
 if target is not null and not private.ec_client_open(new.coach_id,target) then raise exception 'اختر المتدربين النشطين ضمن حد الباقة من صفحة الاشتراك' using errcode='P0403'; end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['programs','subscriptions','payments','freezes','weight_entries','coaching_records','progress_photos','client_goals','client_details','portal_links'] loop
 execute format('create trigger ec_client_data_guard before insert or update on public.%I for each row execute function private.ec_guard_client_data()',t);
 end loop;
end $$;
create trigger ec_resource_guard before insert or update on public.coach_branding for each row execute function private.ec_guard_resource();
-- Metadata reactivation cannot bypass the template count.
create function private.ec_guard_template_metadata() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.ec_plans; used integer; begin
 if new.archived then return new; end if;
 perform 1 from public.ec_accounts where owner_id=new.coach_id for update;
 select * into p from public.ec_plans where code=private.ec_plan(new.coach_id);
 perform private.ec_assert(new.coach_id,'templates');
 select count(*) into used from public.templates t where coach_id=new.coach_id and t.id<>new.template_id and not exists(select 1 from public.template_metadata m where m.template_id=t.id and m.archived);
 if p.template_limit is not null and used>=p.template_limit then raise exception 'وصلت إلى حد القوالب الخاصة'; end if;
 return new;
end $$;
create trigger ec_metadata_guard before insert or update on public.template_metadata for each row execute function private.ec_guard_template_metadata();
create function public.ec_resource_options(after_client uuid default null,after_template uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 with clients as (select id,name from public.clients where coach_id=private.session_uid() and not archived and (after_client is null or id>after_client) order by id limit 100),
 templates as (select id,name from public.templates where coach_id=private.session_uid() and (after_template is null or id>after_template) order by id limit 100)
 select jsonb_build_object('clients',coalesce((select jsonb_agg(to_jsonb(c) order by id) from clients c),'[]'),
 'templates',coalesce((select jsonb_agg(to_jsonb(t) order by id) from templates t),'[]'),
 'next_client',case when (select count(*) from clients)=100 then (select id from clients order by id desc limit 1) end,
 'next_template',case when (select count(*) from templates)=100 then (select id from templates order by id desc limit 1) end)
$$;
create policy ec_record_read on public.coaching_records as restrictive for select to authenticated,coach_api using(
 case when kind in ('note','message') then true when kind='workout_log' then private.ec_has(coach_id,'workout_logs') else private.ec_has(coach_id,'measurements') end);
create policy ec_goals_read on public.client_goals as restrictive for select to authenticated,coach_api using(private.ec_has(coach_id,'programs'));
create policy ec_media_read on public.media_assets as restrictive for select to authenticated,coach_api using(private.ec_has(coach_id,'exercises'));
create policy ec_template_selection on public.templates as restrictive for select to authenticated,coach_api using(private.ec_template_open(coach_id,id));

-- New attendance is part of the trainee package, deliberately separate from SaaS billing.
alter table public.subscriptions add column session_limit integer check(session_limit between 1 and 10000);
create table public.session_attendance (
 id uuid primary key, coach_id uuid not null, client_id uuid not null, subscription_id uuid not null,
 attended_on date not null, created_at timestamptz not null default now(),
 foreign key(client_id,coach_id) references public.clients(id,coach_id) on delete cascade,
 foreign key(subscription_id,coach_id) references public.subscriptions(id,coach_id) on delete cascade,
 unique(subscription_id,attended_on)
);
create index session_attendance_owner on public.session_attendance(coach_id,client_id,attended_on desc);
alter table public.session_attendance enable row level security;
revoke all on public.session_attendance from public,anon,authenticated,coach_api;
create function public.ec_attendance(subscription uuid,attendance_id uuid,attendance_date date) returns boolean language plpgsql security definer set search_path='' as $$
declare s public.subscriptions; existing public.session_attendance; begin
 select * into s from public.subscriptions where id=subscription and coach_id=private.session_uid() for update;
 if not found or not private.ec_client_open(s.coach_id,s.client_id) then raise exception 'الباقة غير متاحة'; end if;
 select * into existing from public.session_attendance where id=attendance_id;
 if found then
  if existing.subscription_id<>s.id or existing.attended_on<>attendance_date then raise exception 'معرف مكرر'; end if;
  return true;
 end if;
 if attendance_date is null or attendance_date<s.start_date or attendance_date>s.end_date or attendance_date>(now() at time zone 'Asia/Riyadh')::date then raise exception 'تاريخ الحضور خارج فترة الباقة أو في المستقبل'; end if;
 if exists(select 1 from public.freezes where subscription_id=s.id and attendance_date between start_date and end_date) then raise exception 'الباقة مجمدة في هذا اليوم'; end if;
 if s.session_limit is not null and (select count(*) from public.session_attendance where subscription_id=s.id)>=s.session_limit then raise exception 'استهلكت جميع الحصص'; end if;
 insert into public.session_attendance values(attendance_id,s.coach_id,s.client_id,s.id,attendance_date);
 return true;
end $$;
create function public.ec_session_limit(subscription uuid,sessions integer) returns boolean language plpgsql security definer set search_path='' as $$
declare s public.subscriptions; begin
 select * into s from public.subscriptions where id=subscription and coach_id=private.session_uid() for update;
 if not found or not private.ec_client_open(s.coach_id,s.client_id) then raise exception 'غير مسموح'; end if;
 if sessions<(select count(*) from public.session_attendance where subscription_id=s.id) then raise exception 'الحد أقل من الحصص المستهلكة'; end if;
 update public.subscriptions set session_limit=sessions where id=s.id; return true;
end $$;
create function private.ec_package_summary(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'start_date',s.start_date,'end_date',s.end_date,
 'session_limit',s.session_limit,'attended', (select count(*) from public.session_attendance where subscription_id=s.id),
 'remaining',case when s.session_limit is not null then s.session_limit-(select count(*) from public.session_attendance where subscription_id=s.id) end,
 'attendance',coalesce((select jsonb_agg(attended_on order by attended_on desc) from public.session_attendance where subscription_id=s.id),'[]')) order by s.start_date desc),'[]')
 from public.subscriptions s where s.client_id=target
$$;
create function public.ec_attendance_page(client uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not exists(select 1 from public.clients where id=client and not archived and (coach_id=private.session_uid() or trainee_user_id=private.session_uid())) then raise exception 'غير مسموح'; end if;
 return private.ec_package_summary(client);
end $$;
create function public.ec_client_features(client uuid) returns text[] language plpgsql stable security definer set search_path='' as $$
declare owner uuid; begin
 select coach_id into owner from public.clients where id=client and not archived and (coach_id=private.session_uid() or trainee_user_id=private.session_uid());
 if owner is null then raise exception 'غير مسموح'; end if;
 return (select features from public.ec_plans where code=private.ec_plan(owner));
end $$;
revoke all on function public.ec_client_features(uuid) from public,anon,authenticated,coach_api;
grant execute on function public.ec_client_features(uuid) to authenticated;
create function public.ec_attendance_roster(after_client uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'packages',private.ec_package_summary(c.id)) order by c.id),'[]')
 from (select id,name from public.clients where coach_id=private.session_uid() and not archived and private.ec_client_open(coach_id,id)
 and (after_client is null or id>after_client) order by id limit 50) c
$$;
revoke all on function public.ec_attendance_roster(uuid) from public,anon,authenticated,coach_api;
grant execute on function public.ec_attendance_roster(uuid) to authenticated;

-- Anonymous portal implementations have definer privileges; apply entitlements there
-- as well as RLS, retaining validation/throttling in the existing implementation.
alter function private.portal_access(text,text,date,numeric,boolean) rename to portal_access_before_ec;
do $$ declare def text; begin
 select pg_get_functiondef('private.portal_access_before_ec(text,text,date,numeric,boolean)'::regprocedure) into def;
 execute replace(def,'portal_access.token_hash','portal_access_before_ec.token_hash');
end $$;
revoke all on function private.portal_access_before_ec(text,text,date,numeric,boolean) from public,anon,authenticated,coach_api;
create function private.portal_access(token_hash text,proof text,day date default null,value numeric default null,remove boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare data jsonb; owner uuid; target uuid; begin
 -- Validate the bearer proof before reading anything belonging to its client.
 data:=private.portal_access_before_ec(token_hash,proof);
 if data ? 'error' then return data; end if;
 select coach_id,client_id into owner,target from public.portal_links where portal_links.token_hash=portal_access.token_hash;
 if not private.ec_client_open(owner,target) then return jsonb_build_object('error','الوصول مقفل حتى يحدد المدرب المتدربين النشطين في باقته'); end if;
 if day is not null then
  perform private.ec_assert(owner,'measurements');
  data:=private.portal_access_before_ec(token_hash,proof,day,value,remove);
 end if;
 if not private.ec_has(owner,'programs') then data:=(data-'program'-'goal')||jsonb_build_object('program',null,'goal',null); end if;
 if not private.ec_has(owner,'measurements') then data:=data||jsonb_build_object('weights','[]'::jsonb); end if;
 return data||jsonb_build_object('basic_only',not private.ec_has(owner,'programs'),'session_packages',private.ec_package_summary(target));
end $$;
grant execute on function private.portal_access(text,text,date,numeric,boolean) to anon,authenticated,coach_api;
alter function private.portal_management(text,text,text,jsonb) rename to portal_management_before_ec;
do $$ declare def text; begin
 select pg_get_functiondef('private.portal_management_before_ec(text,text,text,jsonb)'::regprocedure) into def;
 execute replace(def,'portal_management.token_hash','portal_management_before_ec.token_hash');
end $$;
revoke all on function private.portal_management_before_ec(text,text,text,jsonb) from public,anon,authenticated,coach_api;
create function private.portal_management(token_hash text,proof text,command text,input_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare data jsonb; owner uuid; begin
 data:=private.portal_access(token_hash,proof);
 if data ? 'error' then return data; end if;
 select coach_id into owner from public.portal_links where portal_links.token_hash=portal_management.token_hash;
 if not private.ec_has(owner,'programs') then
  if command<>'snapshot' then raise exception 'هذه البوابة تعرض الرصيد والحضور فقط'; end if;
  return data||jsonb_build_object('client_id',(select client_id from public.portal_links where portal_links.token_hash=portal_management.token_hash),
   'management',jsonb_build_object('records','[]'::jsonb,'details','[]'::jsonb,'progress_photos','[]'::jsonb,'template_metadata','[]'::jsonb,'import_batches','[]'::jsonb,'preferences','{}'::jsonb));
 end if;
 return private.portal_management_before_ec(token_hash,proof,command,input_data);
end $$;
grant execute on function private.portal_management(text,text,text,jsonb) to anon,authenticated;

-- Internal helpers are not callable from the Data API/private schema by users.
revoke all on function private.ec_client_open(uuid,uuid),private.ec_template_open(uuid,uuid),private.ec_guard_client_data(),private.ec_guard_template_metadata(),private.ec_package_summary(uuid) from public,anon,authenticated,coach_api;
grant execute on function private.ec_client_open(uuid,uuid),private.ec_template_open(uuid,uuid) to authenticated,coach_api;
revoke all on function public.ec_resource_options(uuid,uuid),public.ec_attendance(uuid,uuid,date),public.ec_session_limit(uuid,integer),public.ec_attendance_page(uuid) from public,anon,authenticated,coach_api;
grant execute on function public.ec_resource_options(uuid,uuid),public.ec_attendance(uuid,uuid,date),public.ec_session_limit(uuid,integer),public.ec_attendance_page(uuid) to authenticated;
