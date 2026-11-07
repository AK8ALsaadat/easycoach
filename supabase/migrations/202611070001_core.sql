-- Identical application schema for Supabase and the file-backed PostgreSQL preview.
create table public.profiles (
 id uuid primary key references auth.users(id), name text not null check(length(name) between 2 and 120),
 email text not null, role text not null check(role in ('coach','trainee')), created_at timestamptz not null default now()
);
create table public.clients (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null references public.profiles(id),
 name text not null check(length(name) between 2 and 120), email text not null check(length(email)<=254 and position('@' in email)>1),
 phone text not null default '' check(length(phone)<=20), trainee_user_id uuid references auth.users(id),
 archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(coach_id,email), unique(id,coach_id), unique(coach_id,trainee_user_id), check(email=lower(trim(email)))
);
create table public.exercises (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null references public.profiles(id),
 name text not null check(length(name) between 2 and 140), description text not null default '' check(length(description)<=2000),
 video text not null default '' check(video='' or video ~ '^https://'), created_at timestamptz default now(), unique(id,coach_id)
);
create table public.templates (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null references public.profiles(id),
 name text not null check(length(name) between 2 and 140), content jsonb not null, updated_at timestamptz default now(), unique(id,coach_id)
);
create table public.programs (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null, client_id uuid not null,
 name text not null check(length(name) between 2 and 140), content jsonb not null,
 published_at timestamptz, created_at timestamptz not null default now(), version bigint generated always as identity,
 foreign key(client_id,coach_id) references public.clients(id,coach_id), unique(id,coach_id)
);
create unique index one_draft_per_client on public.programs(client_id) where published_at is null;
create table public.subscriptions (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null, client_id uuid not null,
 name text not null check(length(name) between 2 and 100), start_date date not null, end_date date not null,
 price numeric(12,2) not null check(price>=0 and price<=1000000), previous_id uuid unique,
 created_at timestamptz not null default now(), foreign key(client_id,coach_id) references public.clients(id,coach_id),
 unique(id,coach_id), check(end_date>=start_date), foreign key(previous_id,coach_id) references public.subscriptions(id,coach_id)
);
create table public.freezes (
 id uuid primary key, coach_id uuid not null, subscription_id uuid not null,
 start_date date not null, end_date date not null, days integer not null check(days>0 and days<=365),
 applied_at timestamptz not null default now(), foreign key(subscription_id,coach_id) references public.subscriptions(id,coach_id),
 unique(subscription_id,start_date,end_date), check(end_date>=start_date)
);
create table public.payments (
 id uuid primary key, coach_id uuid not null, subscription_id uuid not null, amount numeric(12,2) not null,
 method text not null check(method in ('bank','cash','other')), paid_date date not null,
 reference text not null default '' check(length(reference)<=120), kind text not null check(kind in ('payment','reversal')),
 reverses uuid unique, reason text not null default '' check(length(reason)<=1000), created_at timestamptz not null default now(),
 foreign key(subscription_id,coach_id) references public.subscriptions(id,coach_id), unique(id,coach_id),
 foreign key(reverses,coach_id) references public.payments(id,coach_id),
 check((kind='payment' and amount>0 and reverses is null) or (kind='reversal' and amount<0 and reverses is not null and length(reason)>=5))
);
create unique index payment_reference_unique on public.payments(coach_id,lower(reference)) where reference<>'' and kind='payment';
create unique index payment_fingerprint on public.payments(subscription_id,paid_date,amount,method,reference) where kind='payment';
create table public.invitations (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null, client_id uuid not null,
 email text not null, token_hash text not null unique check(length(token_hash)=64), expires_at timestamptz not null,
 consumed_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(),
 foreign key(client_id,coach_id) references public.clients(id,coach_id)
);
create table public.join_links (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null references public.profiles(id), token_hash text not null unique check(length(token_hash)=64),
 expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz default now()
);
create table public.join_requests (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null references public.profiles(id),
 name text not null check(length(name) between 2 and 120), email text not null check(length(email)<=254 and position('@' in email)>1),
 phone text not null default '' check(length(phone)<=20), status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz default now(), unique(coach_id,email)
);
create table public.privacy_requests (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null, client_id uuid not null,
 kind text not null check(kind in ('correction','deletion')), details text not null check(length(details) between 5 and 2000),
 status text not null default 'pending' check(status in ('pending','fulfilled')), resolution text not null default '', created_at timestamptz default now(),
 foreign key(client_id,coach_id) references public.clients(id,coach_id)
);
create table public.audit (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null references public.profiles(id), actor_id uuid not null,
 action text not null, entity_id uuid, detail text not null default '', created_at timestamptz not null default now()
);

create function public.latest_program(target uuid) returns uuid language sql stable security definer set search_path='' as $$
 select p.id from public.programs p join public.clients c on c.id=p.client_id
 where c.id=target and not c.archived and (c.coach_id=auth.uid() or c.trainee_user_id=auth.uid()) and p.published_at is not null
 order by p.published_at desc,p.version desc limit 1
$$;

do $$ declare t text; begin
 foreach t in array array['profiles','clients','exercises','templates','programs','subscriptions','freezes','payments','invitations','join_links','join_requests','privacy_requests','audit'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy profile_self on public.profiles for select to authenticated using(id=auth.uid());
create policy client_read on public.clients for select to authenticated using(coach_id=auth.uid() or (trainee_user_id=auth.uid() and not archived));
create policy client_write on public.clients for all to authenticated using(coach_id=auth.uid()) with check(coach_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='coach'));
do $$ declare t text; begin
 foreach t in array array['exercises','templates','programs','subscriptions','freezes','payments','invitations','join_links','join_requests','privacy_requests'] loop
  execute format('create policy coach_own on public.%I for all to authenticated using(coach_id=auth.uid()) with check(coach_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role=''coach''))',t);
 end loop;
end $$;
create policy trainee_program on public.programs for select to authenticated using(id=public.latest_program(client_id));
create policy trainee_subscription on public.subscriptions for select to authenticated using(exists(select 1 from public.clients c where c.id=client_id and c.trainee_user_id=auth.uid() and not c.archived));
create policy trainee_payment on public.payments for select to authenticated using(exists(select 1 from public.subscriptions s join public.clients c on c.id=s.client_id where s.id=subscription_id and c.trainee_user_id=auth.uid() and not c.archived));
create policy trainee_freeze on public.freezes for select to authenticated using(exists(select 1 from public.subscriptions s join public.clients c on c.id=s.client_id where s.id=subscription_id and c.trainee_user_id=auth.uid() and not c.archived));
create policy privacy_self_read on public.privacy_requests for select to authenticated using(exists(select 1 from public.clients c where c.id=client_id and c.trainee_user_id=auth.uid()));
create policy privacy_self_insert on public.privacy_requests for insert to authenticated with check(status='pending' and resolution='' and exists(select 1 from public.clients c where c.id=client_id and c.coach_id=privacy_requests.coach_id and c.trainee_user_id=auth.uid() and not c.archived));
create policy audit_owner_read on public.audit for select to authenticated using(coach_id=auth.uid());

create function public.log_change() returns trigger language plpgsql security definer set search_path='' as $$
declare rowdata jsonb; begin
 rowdata:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.audit(coach_id,actor_id,action,entity_id) values((rowdata->>'coach_id')::uuid,coalesce(auth.uid(),(rowdata->>'coach_id')::uuid),TG_TABLE_NAME||':'||TG_OP,(rowdata->>'id')::uuid);
 return case when TG_OP='DELETE' then old else new end;
end $$;
do $$ declare t text; begin
 foreach t in array array['clients','exercises','templates','programs','subscriptions','freezes','payments','invitations','join_links','join_requests','privacy_requests'] loop
  execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function public.log_change()',t);
 end loop;
end $$;
create function public.immutable_finance() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'السجل ثابت؛ استخدم التصحيح الموثق'; end $$;
create trigger immutable_payment before update or delete on public.payments for each row execute function public.immutable_finance();
create trigger immutable_freeze before update or delete on public.freezes for each row execute function public.immutable_finance();
create function public.guard_published() returns trigger language plpgsql set search_path='' as $$ begin
 if old.published_at is not null then raise exception 'البرنامج المنشور ثابت؛ أنشئ نسخة جديدة'; end if;
 return new;
end $$;
create trigger published_snapshot before update on public.programs for each row execute function public.guard_published();

create function public.valid_content(body jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare d jsonb; e jsonb; n jsonb; begin
 if jsonb_typeof(body) is distinct from 'object' or not(body ?& array['days','nutrition']) or body-array['days','nutrition']<>'{}'::jsonb or jsonb_typeof(body->'days') is distinct from 'array' or jsonb_array_length(body->'days') not between 1 and 14 then return false; end if;
 for d in select value from jsonb_array_elements(body->'days') loop
  if not(d ?& array['name','exercises']) or jsonb_typeof(d->'name') is distinct from 'string' or length(d->>'name') not between 1 and 100 or jsonb_typeof(d->'exercises') is distinct from 'array' or jsonb_array_length(d->'exercises') not between 1 and 40 or d-array['name','exercises']<>'{}'::jsonb then return false; end if;
  for e in select value from jsonb_array_elements(d->'exercises') loop
   if not(e ?& array['name','description','video','sets','reps','rest']) or jsonb_typeof(e->'name') is distinct from 'string' or jsonb_typeof(e->'description') is distinct from 'string' or jsonb_typeof(e->'video') is distinct from 'string' or jsonb_typeof(e->'sets') is distinct from 'number' or jsonb_typeof(e->'reps') is distinct from 'string' or jsonb_typeof(e->'rest') is distinct from 'number' or e-array['name','description','video','sets','reps','rest']<>'{}'::jsonb or length(e->>'name') not between 2 and 140 or length(e->>'description')>2000 or (e->>'sets')::int not between 1 and 20 or length(e->>'reps') not between 1 and 60 or (e->>'rest')::int not between 0 and 600 or (coalesce(e->>'video','')<>'' and e->>'video' !~ '^https://') then return false; end if;
  end loop;
 end loop;
 n:=body->'nutrition';
 if n is null or not(n ?& array['text','calories','protein','carbs','fat']) or jsonb_typeof(n->'text') is distinct from 'string' or jsonb_typeof(n->'calories') is distinct from 'number' or jsonb_typeof(n->'protein') is distinct from 'number' or jsonb_typeof(n->'carbs') is distinct from 'number' or jsonb_typeof(n->'fat') is distinct from 'number' or n-array['text','calories','protein','carbs','fat']<>'{}'::jsonb or length(n->>'text')>10000 or (n->>'calories')::numeric not between 0 and 10000 or (n->>'protein')::numeric not between 0 and 1000 or (n->>'carbs')::numeric not between 0 and 1000 or (n->>'fat')::numeric not between 0 and 1000 then return false; end if;
 return true;
exception when others then return false;
end $$;
alter table public.programs add constraint safe_program check(public.valid_content(content));
alter table public.templates add constraint safe_template check(public.valid_content(content));

-- Profiles only come from the currently verified auth identity, never a submitted email.
create function public.init_profile(display_name text, requested_role text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u record; begin
 select id,email,email_confirmed_at into u from auth.users where id=auth.uid();
 if u.id is null or u.email_confirmed_at is null then raise exception 'تحقق من إيميلك أولًا'; end if;
 if requested_role not in ('coach','trainee') then raise exception 'دور غير صالح'; end if;
 insert into public.profiles(id,name,email,role) values(u.id,display_name,lower(u.email),requested_role) on conflict(id) do nothing;
 return (select to_jsonb(p) from public.profiles p where id=u.id);
end $$;

create function public.app_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'profile',(select to_jsonb(p) from public.profiles p where id=auth.uid()),
 'clients',coalesce((select jsonb_agg(c order by c.created_at desc) from public.clients c),'[]'),
 'exercises',coalesce((select jsonb_agg(e order by e.created_at desc) from public.exercises e),'[]'),
 'templates',coalesce((select jsonb_agg(t order by t.updated_at desc) from public.templates t),'[]'),
 'programs',coalesce((select jsonb_agg(p order by p.version desc) from public.programs p),'[]'),
 'subscriptions',coalesce((select jsonb_agg(s order by s.created_at desc) from public.subscriptions s),'[]'),
 'freezes',coalesce((select jsonb_agg(f) from public.freezes f),'[]'),
 'payments',coalesce((select jsonb_agg(p order by p.created_at desc) from public.payments p),'[]'),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'client_id',i.client_id,'expires_at',i.expires_at,'consumed_at',i.consumed_at,'revoked_at',i.revoked_at)) from public.invitations i),'[]'),
 'join_requests',coalesce((select jsonb_agg(r order by r.created_at desc) from public.join_requests r),'[]'),
 'privacy_requests',coalesce((select jsonb_agg(r order by r.created_at desc) from public.privacy_requests r),'[]'),
 'audit',coalesce((select jsonb_agg(a) from (select * from public.audit order by created_at desc limit 100) a),'[]')
 )
$$;

create function public.app_command(command text,payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); cid uuid; sid uuid; rid uuid; result jsonb; sub public.subscriptions; pay public.payments; f public.freezes; r public.join_requests; cl public.clients; total numeric; rowdata jsonb; firstdate date; lastdate date;
begin
 if uid is null then raise exception 'يلزم تسجيل الدخول'; end if;
 if command='privacy_request' then
  select * into cl from public.clients where id=(payload->>'client_id')::uuid and trainee_user_id=uid;
  if cl.id is null then raise exception 'غير مسموح'; end if;
  insert into public.privacy_requests(coach_id,client_id,kind,details) values(cl.coach_id,cl.id,payload->>'kind',payload->>'details') returning to_jsonb(privacy_requests) into result; return result;
 end if;
 if not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'هذه العملية للمدرب فقط'; end if;
 case command
 when 'client_save' then
  if payload->>'id' is null then
   insert into public.clients(coach_id,name,email,phone) values(uid,trim(payload->>'name'),lower(trim(payload->>'email')),coalesce(payload->>'phone','')) returning to_jsonb(clients) into result;
  else
   update public.clients set name=trim(payload->>'name'),trainee_user_id=case when email<>lower(trim(payload->>'email')) then null else trainee_user_id end,email=lower(trim(payload->>'email')),phone=coalesce(payload->>'phone',''),updated_at=now() where id=(payload->>'id')::uuid and coach_id=uid and not archived returning to_jsonb(clients) into result;
   update public.invitations set revoked_at=now() where client_id=(payload->>'id')::uuid and coach_id=uid and email<>lower(trim(payload->>'email')) and consumed_at is null;
  end if;
 when 'import_clients' then
  if jsonb_array_length(payload->'rows')>2000 then raise exception 'حد الاستيراد 2000 صف'; end if;
  for rowdata in select value from jsonb_array_elements(payload->'rows') loop
   insert into public.clients(coach_id,name,email,phone) values(uid,trim(rowdata->>'name'),lower(trim(rowdata->>'email')),coalesce(rowdata->>'phone',''))
   on conflict(coach_id,email) do update set name=excluded.name,phone=excluded.phone,updated_at=now() where (payload->>'overwrite')::boolean and not clients.archived;
  end loop;
  result:=jsonb_build_object('imported',jsonb_array_length(payload->'rows'));
 when 'exercise_save' then
  if payload->>'id' is null then
   insert into public.exercises(coach_id,name,description,video) values(uid,payload->>'name',coalesce(payload->>'description',''),coalesce(payload->>'video','')) returning to_jsonb(exercises) into result;
  else
   update public.exercises set name=payload->>'name',description=payload->>'description',video=payload->>'video' where id=(payload->>'id')::uuid and coach_id=uid returning to_jsonb(exercises) into result;
  end if;
 when 'template_save' then
  if payload->>'id' is null then
   insert into public.templates(coach_id,name,content) values(uid,payload->>'name',payload->'content') returning to_jsonb(templates) into result;
  else
   update public.templates set name=payload->>'name',content=payload->'content',updated_at=now() where id=(payload->>'id')::uuid and coach_id=uid returning to_jsonb(templates) into result;
  end if;
 when 'program_save' then
  cid:=(payload->>'client_id')::uuid;
  select id into rid from public.programs where client_id=cid and coach_id=uid and published_at is null for update;
  if rid is null then
   insert into public.programs(coach_id,client_id,name,content) values(uid,cid,payload->>'name',payload->'content') returning to_jsonb(programs) into result;
  else
   update public.programs set name=payload->>'name',content=payload->'content' where id=rid returning to_jsonb(programs) into result;
  end if;
 when 'program_publish' then
  update public.programs set published_at=clock_timestamp() where id=(payload->>'id')::uuid and coach_id=uid and published_at is null returning to_jsonb(programs) into result;
 when 'subscription_create' then
  cid:=(payload->>'client_id')::uuid;
  perform id from public.clients where id=cid and coach_id=uid and not archived for update;
  if not found then raise exception 'العميل غير متاح'; end if;
  if payload->>'previous_id' is not null then
   select * into sub from public.subscriptions where id=(payload->>'previous_id')::uuid and coach_id=uid for update;
   if sub.id is null or sub.client_id<>cid or (payload->>'start_date')::date<=sub.end_date then raise exception 'التجديد يبدأ بعد انتهاء الباقة السابقة'; end if;
  end if;
  if exists(select 1 from public.subscriptions where client_id=cid and coach_id=uid and daterange(start_date,end_date,'[]') && daterange((payload->>'start_date')::date,(payload->>'end_date')::date,'[]')) then raise exception 'توجد باقة تتداخل مع هذه الفترة'; end if;
  insert into public.subscriptions(coach_id,client_id,name,start_date,end_date,price,previous_id) values(uid,cid,payload->>'name',(payload->>'start_date')::date,(payload->>'end_date')::date,(payload->>'price')::numeric,(payload->>'previous_id')::uuid) returning to_jsonb(subscriptions) into result;
 when 'freeze_apply' then
  sid:=(payload->>'subscription_id')::uuid; rid:=(payload->>'id')::uuid;
  select * into sub from public.subscriptions where id=sid and coach_id=uid for update;
  if sub.id is null then raise exception 'الباقة غير موجودة'; end if;
  select * into f from public.freezes where id=rid;
  if f.id is not null then
   if f.subscription_id<>sid or f.start_date<>(payload->>'start_date')::date or f.end_date<>(payload->>'end_date')::date then raise exception 'تعارض في مفتاح العملية'; end if;
   return to_jsonb(f);
  end if;
  firstdate:=(payload->>'start_date')::date; lastdate:=(payload->>'end_date')::date;
  if firstdate<sub.start_date or firstdate>sub.end_date or lastdate<firstdate or lastdate-firstdate>364 then raise exception 'فترة التجميد غير صالحة'; end if;
  if exists(select 1 from public.subscriptions where previous_id=sid) then raise exception 'لا تجمّد باقة جرى تجديدها'; end if;
  if exists(select 1 from public.freezes where subscription_id=sid and daterange(start_date,end_date,'[]') && daterange(firstdate,lastdate,'[]')) then raise exception 'فترة التجميد متداخلة أو مطبقة سابقًا'; end if;
  insert into public.freezes(id,coach_id,subscription_id,start_date,end_date,days) values(rid,uid,sid,firstdate,lastdate,lastdate-firstdate+1) returning to_jsonb(freezes) into result;
  update public.subscriptions set end_date=end_date+(lastdate-firstdate+1) where id=sid;
 when 'payment_add' then
  sid:=(payload->>'subscription_id')::uuid; rid:=(payload->>'id')::uuid;
  select * into sub from public.subscriptions where id=sid and coach_id=uid for update;
  if sub.id is null then raise exception 'الباقة غير موجودة'; end if;
  select * into pay from public.payments where id=rid;
  if pay.id is not null then
   if pay.subscription_id<>sid or pay.amount<>(payload->>'amount')::numeric or pay.method<>payload->>'method' or pay.paid_date<>(payload->>'paid_date')::date or pay.reference<>trim(coalesce(payload->>'reference','')) then raise exception 'تعارض في مفتاح العملية'; end if;
   return to_jsonb(pay);
  end if;
  select coalesce(sum(amount),0) into total from public.payments where subscription_id=sid;
  if total+(payload->>'amount')::numeric>sub.price then raise exception 'الدفعة تتجاوز المتبقي'; end if;
  insert into public.payments(id,coach_id,subscription_id,amount,method,paid_date,reference,kind) values(rid,uid,sid,(payload->>'amount')::numeric,payload->>'method',(payload->>'paid_date')::date,trim(coalesce(payload->>'reference','')),'payment') returning to_jsonb(payments) into result;
 when 'payment_reverse' then
  select * into pay from public.payments where id=(payload->>'payment_id')::uuid and coach_id=uid and kind='payment';
  if pay.id is null then raise exception 'الدفعة غير موجودة'; end if;
  perform id from public.subscriptions where id=pay.subscription_id for update;
  insert into public.payments(id,coach_id,subscription_id,amount,method,paid_date,reference,kind,reverses,reason) values((payload->>'id')::uuid,uid,pay.subscription_id,-pay.amount,pay.method,(now() at time zone 'Asia/Riyadh')::date,'','reversal',pay.id,payload->>'reason') returning to_jsonb(payments) into result;
 when 'invite_create' then
  select * into cl from public.clients where id=(payload->>'client_id')::uuid and coach_id=uid and not archived;
  if cl.id is null then raise exception 'العميل غير موجود'; end if;
  update public.invitations set revoked_at=now() where client_id=cl.id and consumed_at is null;
  insert into public.invitations(coach_id,client_id,email,token_hash,expires_at) values(uid,cl.id,cl.email,payload->>'token_hash',now()+interval '7 days') returning jsonb_build_object('id',id,'expires_at',expires_at) into result;
 when 'invite_revoke' then
  update public.invitations set revoked_at=now() where id=(payload->>'id')::uuid and coach_id=uid returning jsonb_build_object('id',id) into result;
 when 'join_link_create' then
  update public.join_links set revoked_at=now() where coach_id=uid and revoked_at is null;
  insert into public.join_links(coach_id,token_hash,expires_at) values(uid,payload->>'token_hash',now()+interval '30 days') returning jsonb_build_object('id',id) into result;
 when 'join_review' then
  select * into r from public.join_requests where id=(payload->>'id')::uuid and coach_id=uid and status='pending' for update;
  if r.id is null then raise exception 'الطلب غير موجود أو تمت مراجعته'; end if;
  if (payload->>'approve')::boolean then
   insert into public.clients(coach_id,name,email,phone) values(uid,r.name,r.email,r.phone) on conflict(coach_id,email) do nothing;
   update public.join_requests set status='approved' where id=r.id;
  else update public.join_requests set status='rejected' where id=r.id; end if;
  result:=jsonb_build_object('id',r.id);
 when 'privacy_fulfill' then
  select client_id into cid from public.privacy_requests where id=(payload->>'id')::uuid and coach_id=uid and status='pending';
  if cid is null then raise exception 'الطلب غير موجود'; end if;
  if exists(select 1 from public.privacy_requests where id=(payload->>'id')::uuid and kind='deletion') then
   select * into cl from public.clients where id=cid;
   delete from public.programs where client_id=cid;
   delete from public.invitations where client_id=cid;
   delete from public.join_requests where coach_id=uid and email=cl.email;
   update public.clients set name='عميل محذوف',email=id::text||'@deleted.invalid',phone='',trainee_user_id=null,archived=true where id=cid;
   update public.privacy_requests set details='تم حذف بيانات التعريف',status='fulfilled',resolution=payload->>'resolution' where client_id=cid;
  else update public.privacy_requests set status='fulfilled',resolution=payload->>'resolution' where id=(payload->>'id')::uuid; end if;
  result:=jsonb_build_object('id',cid);
 else raise exception 'عملية غير معروفة';
 end case;
 if result is null then raise exception 'السجل غير موجود أو غير مسموح'; end if;
 return result;
end $$;

create function public.public_link_info(token text,link_type text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if link_type='join' then
  select jsonb_build_object('coach',p.name,'type','join') into result from public.join_links l join public.profiles p on p.id=l.coach_id where l.token_hash=token and l.expires_at>now() and l.revoked_at is null;
 elsif link_type='invite' then
  select jsonb_build_object('coach',p.name,'type','invite','email_hint',left(i.email,1)||'***@'||split_part(i.email,'@',2)) into result from public.invitations i join public.profiles p on p.id=i.coach_id where i.token_hash=token and i.expires_at>now() and i.revoked_at is null and i.consumed_at is null;
 end if;
 return result;
end $$;
create function public.request_join(token text,display_name text,contact_email text,contact_phone text) returns boolean language plpgsql security definer set search_path='' as $$
declare cid uuid; begin
 select coach_id into cid from public.join_links where token_hash=token and expires_at>now() and revoked_at is null;
 if cid is null then raise exception 'الرابط منتهي أو غير صالح'; end if;
 if (select count(*) from public.join_requests where coach_id=cid and created_at>now()-interval '1 hour')>=50 then raise exception 'الطلبات كثيرة؛ حاول لاحقًا'; end if;
 insert into public.join_requests(coach_id,name,email,phone) values(cid,display_name,lower(trim(contact_email)),contact_phone) on conflict(coach_id,email) do nothing;
 return true;
end $$;
create function public.claim_invite(token text) returns boolean language plpgsql security definer set search_path='' as $$
declare i public.invitations; u record; begin
 select id,email,email_confirmed_at into u from auth.users where id=auth.uid();
 if u.id is null or u.email_confirmed_at is null then raise exception 'يلزم الدخول بإيميل موثّق'; end if;
 select * into i from public.invitations where token_hash=token and consumed_at is null and revoked_at is null and expires_at>now() for update;
 if i.id is null or lower(u.email)<>i.email then raise exception 'الدعوة غير صالحة لهذا الحساب'; end if;
 if exists(select 1 from public.clients where id=i.client_id and trainee_user_id is not null and trainee_user_id<>u.id) then raise exception 'الدعوة مستخدمة'; end if;
 update public.clients set trainee_user_id=u.id where id=i.client_id and coach_id=i.coach_id and not archived;
 if not found then raise exception 'العميل غير متاح'; end if;
 update public.invitations set consumed_at=now() where id=i.id;
 return true;
end $$;

-- Narrow the default Supabase grants. Ledger writes and mutations only through validated RPCs
-- still run as the authenticated caller; RLS remains active inside app_command.
grant usage on schema public to authenticated,anon;
grant select on public.profiles,public.audit to authenticated;
grant select,insert,update,delete on public.clients,public.exercises,public.templates,public.programs,public.subscriptions,public.freezes,public.payments,public.invitations,public.join_links,public.join_requests,public.privacy_requests to authenticated;
grant usage,select on all sequences in schema public to authenticated;
revoke all on function public.log_change() from public,anon,authenticated;
revoke all on function public.immutable_finance() from public,anon,authenticated;
revoke all on function public.guard_published() from public,anon,authenticated;
revoke all on function public.init_profile(text,text),public.app_snapshot(),public.app_command(text,jsonb),public.claim_invite(text) from public,anon;
grant execute on function public.init_profile(text,text),public.app_snapshot(),public.app_command(text,jsonb),public.claim_invite(text) to authenticated;
revoke all on function public.latest_program(uuid) from public,anon;
grant execute on function public.latest_program(uuid) to authenticated;
revoke all on function public.public_link_info(text,text),public.request_join(text,text,text,text) from public;
grant execute on function public.public_link_info(text,text),public.request_join(text,text,text,text) to anon,authenticated;

-- A non-login function owner keeps table writes inaccessible through PostgREST.
-- It is NOT a table owner and has NO BYPASSRLS: the same tenant policies apply.
do $$ begin if not exists(select 1 from pg_roles where rolname='coach_api') then create role coach_api nologin noinherit; end if; end $$;
grant usage on schema public,auth to coach_api;
grant execute on function auth.uid() to coach_api;
grant select on public.profiles,public.audit to coach_api;
grant select,insert,update,delete on public.clients,public.exercises,public.templates,public.programs,public.subscriptions,public.freezes,public.payments,public.invitations,public.join_links,public.join_requests,public.privacy_requests to coach_api;
grant usage,select on all sequences in schema public to coach_api;
grant execute on function public.latest_program(uuid) to coach_api;
do $$ declare p record; begin
 for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' loop
  execute format('alter policy %I on public.%I to authenticated,coach_api',p.policyname,p.tablename);
 end loop;
end $$;
revoke insert,update,delete on public.clients,public.exercises,public.templates,public.programs,public.subscriptions,public.freezes,public.payments,public.invitations,public.join_links,public.join_requests,public.privacy_requests from authenticated;
alter function public.app_command(text,jsonb) security definer;
grant create on schema public to coach_api;
grant coach_api to postgres;
alter function public.app_command(text,jsonb) owner to coach_api;
revoke create on schema public from coach_api;
revoke all on public.profiles,public.clients,public.exercises,public.templates,public.programs,public.subscriptions,public.freezes,public.payments,public.invitations,public.join_links,public.join_requests,public.privacy_requests,public.audit from anon;
