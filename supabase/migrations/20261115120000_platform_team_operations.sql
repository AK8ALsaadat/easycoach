-- Organization operations have explicit scopes. They never impersonate the owner
-- or change session_uid/JWT claims to reuse a privileged legacy RPC.
create table public.ec_branches (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.ec_accounts(owner_id),
 name text not null check(length(trim(name)) between 2 and 120),active boolean not null default true,
 unique(id,owner_id)
);
create table public.ec_team (
 owner_id uuid not null references public.ec_accounts(owner_id),member_id uuid not null references public.profiles(id),
 role text not null check(role in ('trainer','branch_manager')),branch_id uuid,
 accepted_at timestamptz,active boolean not null default true,created_at timestamptz not null default now(),
 primary key(owner_id,member_id),check(owner_id<>member_id),
 foreign key(branch_id,owner_id) references public.ec_branches(id,owner_id)
);
create table public.ec_assignments (
 owner_id uuid not null references public.ec_accounts(owner_id),client_id uuid primary key,
 member_id uuid,branch_id uuid,
 foreign key(client_id,owner_id) references public.clients(id,coach_id) on delete cascade,
 foreign key(owner_id,member_id) references public.ec_team(owner_id,member_id),
 foreign key(branch_id,owner_id) references public.ec_branches(id,owner_id)
);
create index ec_assignment_scope on public.ec_assignments(owner_id,branch_id,member_id,client_id);
create table public.ec_tasks (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.ec_accounts(owner_id),
 client_id uuid not null,assignee_id uuid not null references public.profiles(id),
 title text not null check(length(trim(title)) between 2 and 200),due_at timestamptz not null,
 status text not null default 'open' check(status in ('open','done')),source text not null default 'manual',
 created_at timestamptz not null default now(),
 foreign key(client_id,owner_id) references public.clients(id,coach_id) on delete cascade,unique(owner_id,client_id,source)
);
create index ec_tasks_page on public.ec_tasks(owner_id,status,due_at,id);
create table public.ec_rules (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.ec_accounts(owner_id),
 event text not null check(event in ('expiry','low_sessions','inactive')),
 threshold integer not null check(threshold between 1 and 365),
 action text not null check(action in ('task','email','both')),enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.ec_team_audit (
 id bigint generated always as identity primary key,owner_id uuid not null references public.ec_accounts(owner_id),
 actor_id uuid not null references public.profiles(id),action text not null,entity_id uuid,created_at timestamptz not null default now()
);
create index ec_team_audit_page on public.ec_team_audit(owner_id,created_at desc,id);
create function private.ec_scope(owner uuid,target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.ec_client_open(owner,target) and exists(select 1 from public.clients where id=target and coach_id=owner and not archived) and
 (owner=private.session_uid() or (private.ec_has(owner,'team') and
 (select count(*)+1 from public.ec_team where owner_id=owner and active)<=(select coach_limit from public.ec_plans where code=private.ec_plan(owner)) and
 exists(select 1 from public.ec_team m join public.ec_assignments a on a.owner_id=m.owner_id and a.client_id=target
 where m.owner_id=owner and m.member_id=private.session_uid() and m.active and m.accepted_at is not null
 and (a.branch_id is null or exists(select 1 from public.ec_branches b where b.id=a.branch_id and b.active)) and
 ((m.role='trainer' and a.member_id=m.member_id) or (m.role='branch_manager' and private.ec_has(owner,'roles') and a.branch_id=m.branch_id)))))
$$;
create function public.ec_team_invite(email_address text,member_role text,branch uuid default null) returns boolean language plpgsql security definer set search_path='' as $$
declare owner uuid:=private.session_uid(); member uuid; p public.ec_plans; begin
 perform 1 from public.ec_accounts where owner_id=owner for update;
 if not found then raise exception 'غير مسموح'; end if;
 perform private.ec_assert(owner,'team');
 if member_role not in ('trainer','branch_manager') then raise exception 'دور غير صالح'; end if;
 if member_role='branch_manager' or branch is not null then perform private.ec_assert(owner,'roles'); end if;
 if member_role='branch_manager' and branch is null then raise exception 'اختر فرع المدير'; end if;
 select id into member from public.profiles where email=lower(trim(email_address)) and role='coach';
 if member is null or member=owner then raise exception 'يلزم حساب مدرب موثق آخر لهذا البريد'; end if;
 select * into p from public.ec_plans where code=private.ec_plan(owner);
 if not exists(select 1 from public.ec_team where owner_id=owner and member_id=member and active) and
 (select count(*)+1 from public.ec_team where owner_id=owner and active)>=p.coach_limit then raise exception 'وصلت إلى حد حسابات المدربين شامل المالك'; end if;
 insert into public.ec_team(owner_id,member_id,role,branch_id) values(owner,member,member_role,branch)
 on conflict(owner_id,member_id) do update set role=excluded.role,branch_id=excluded.branch_id,active=true,accepted_at=null;
 insert into public.ec_team_audit(owner_id,actor_id,action,entity_id) values(owner,owner,'team_invite',member); return true;
end $$;
create function public.ec_team_accept(owner uuid) returns boolean language plpgsql security definer set search_path='' as $$ begin
 perform private.ec_assert(owner,'team');
 update public.ec_team set accepted_at=now() where owner_id=owner and member_id=private.session_uid() and active;
 if not found then raise exception 'الدعوة غير متاحة'; end if; return true;
end $$;
create function public.ec_team_deactivate(member uuid) returns boolean language plpgsql security definer set search_path='' as $$ begin
 update public.ec_team set active=false where owner_id=private.session_uid() and member_id=member;
 if not found then raise exception 'غير مسموح'; end if;
 insert into public.ec_team_audit(owner_id,actor_id,action,entity_id) values(private.session_uid(),private.session_uid(),'team_deactivate',member); return true;
end $$;
create function public.ec_branch_save(branch uuid,branch_name text,enabled boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare owner uuid:=private.session_uid(); result uuid; begin
 perform private.ec_assert(owner,'branches');
 if branch is null then insert into public.ec_branches(owner_id,name,active) values(owner,branch_name,enabled) returning id into result;
 else update public.ec_branches set name=branch_name,active=enabled where id=branch and owner_id=owner returning id into result; end if;
 if result is null then raise exception 'غير مسموح'; end if;
 insert into public.ec_team_audit(owner_id,actor_id,action,entity_id) values(owner,owner,'branch_save',result); return result;
end $$;
-- Bulk requests have a preview digest tied to actor, tenant, exact IDs and operation.
create table public.ec_bulk_previews (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.ec_accounts(owner_id),
 actor_id uuid not null,operation text not null check(operation in ('assign','program','notify')),body jsonb not null check(octet_length(body::text)<=65536),
 expires_at timestamptz not null default now()+interval '10 minutes',applied_at timestamptz,created_at timestamptz not null default now()
);
create function public.ec_bulk_preview(operation text,body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=private.session_uid(); target uuid; count_clients integer; result uuid; begin
 perform private.ec_assert(owner,'bulk');
 if operation not in ('assign','program','notify') or jsonb_typeof(body->'clients') is distinct from 'array' then raise exception 'طلب غير صالح'; end if;
 count_clients:=jsonb_array_length(body->'clients'); if count_clients not between 1 and 100 then raise exception 'اختر من 1 إلى 100 متدرب في العملية'; end if;
 if (select count(distinct value) from jsonb_array_elements_text(body->'clients'))<>count_clients then raise exception 'المتدرب مكرر في المعاينة'; end if;
 for target in select distinct value::uuid from jsonb_array_elements_text(body->'clients') loop
 if not private.ec_scope(owner,target) then raise exception 'متدرب غير متاح'; end if;
 end loop;
 if operation='assign' then
  if body->>'member' is not null and not exists(select 1 from public.ec_team where owner_id=owner and member_id=(body->>'member')::uuid and active and accepted_at is not null) then raise exception 'مدرب غير متاح'; end if;
  if body->>'branch' is not null and not exists(select 1 from public.ec_branches where owner_id=owner and id=(body->>'branch')::uuid and active) then raise exception 'فرع غير متاح'; end if;
 elsif operation='program' then
  if not exists(select 1 from public.templates where coach_id=owner and id=(body->>'template')::uuid) or exists(select 1 from public.template_metadata where template_id=(body->>'template')::uuid and (archived or kind<>'workout')) then raise exception 'اختر قالب تمرين غير مؤرشف'; end if;
 end if;
 insert into public.ec_bulk_previews(owner_id,actor_id,operation,body) values(owner,owner,operation,body) returning id into result;
 return jsonb_build_object('id',result,'operation',operation,'count',count_clients,'expires_at',now()+interval '10 minutes');
end $$;
create function public.ec_assign_client(client uuid,member uuid,branch uuid default null) returns boolean language plpgsql security definer set search_path='' as $$
declare owner uuid:=private.session_uid(); begin
 perform private.ec_assert(owner,'team');
 if not private.ec_scope(owner,client) then raise exception 'غير مسموح'; end if;
 if member is not null and not exists(select 1 from public.ec_team where owner_id=owner and member_id=member and active and accepted_at is not null) then raise exception 'مدرب غير متاح'; end if;
 if branch is not null then
  perform private.ec_assert(owner,'branches');
  if not exists(select 1 from public.ec_branches where owner_id=owner and id=branch and active) then raise exception 'فرع غير متاح'; end if;
 end if;
 insert into public.ec_assignments(owner_id,client_id,member_id,branch_id) values(owner,client,member,branch)
 on conflict(client_id) do update set member_id=excluded.member_id,branch_id=excluded.branch_id;
 insert into public.ec_team_audit(owner_id,actor_id,action,entity_id) values(owner,owner,'assign_client',client); return true;
end $$;
create function public.ec_team_homes() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('owner',t.owner_id,'name',p.name,'accepted',t.accepted_at is not null)),'[]')
 from public.ec_team t join public.profiles p on p.id=t.owner_id where member_id=private.session_uid() and active
$$;
create function public.ec_org_page(owner uuid,after_client uuid default null,branch uuid default null,member uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if owner<>private.session_uid() and not exists(select 1 from public.ec_team where owner_id=owner and member_id=private.session_uid() and active and accepted_at is not null) then raise exception 'غير مسموح'; end if;
 perform private.ec_assert(owner,'team');
 if branch is not null then perform private.ec_assert(owner,'branches'); end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') into result from
 (select c.id,c.name,c.email,a.member_id,a.branch_id,
  (select jsonb_build_object('name',p.name,'content',p.content,'published_at',p.published_at) from public.programs p where p.client_id=c.id and p.published_at is not null order by p.published_at desc,p.version desc limit 1) as program
 from public.clients c left join public.ec_assignments a on a.client_id=c.id
 where c.coach_id=owner and private.ec_scope(owner,c.id) and (after_client is null or c.id>after_client)
 and (branch is null or a.branch_id=branch) and (member is null or a.member_id=member)
 order by c.id limit 50) c;
 return jsonb_build_object('clients',result,'features',(select to_jsonb(features) from public.ec_plans where code=private.ec_plan(owner)),
 'members',case when owner=private.session_uid() then coalesce((select jsonb_agg(jsonb_build_object('id',m.member_id,'name',p.name,'role',m.role,'active',m.active,'accepted',m.accepted_at is not null)) from public.ec_team m join public.profiles p on p.id=m.member_id where m.owner_id=owner),'[]') else '[]'::jsonb end,
 'branches',case when private.ec_has(owner,'branches') then coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'active',b.active)) from public.ec_branches b where b.owner_id=owner and (owner=private.session_uid() or exists(select 1 from public.ec_team m where m.owner_id=owner and m.member_id=private.session_uid() and m.branch_id=b.id))),'[]') else '[]'::jsonb end,
 'tasks',coalesce((select jsonb_agg(t order by t.due_at,t.id) from (select * from public.ec_tasks where owner_id=owner and private.ec_scope(owner,client_id) order by due_at,id limit 100) t),'[]'),
 'rules',case when owner=private.session_uid() and private.ec_has(owner,'reminders') then coalesce((select jsonb_agg(r) from public.ec_rules r where owner_id=owner),'[]') else '[]'::jsonb end,
 'audit',case when owner=private.session_uid() and private.ec_has(owner,'team_audit') then coalesce((select jsonb_agg(a order by a.created_at desc,a.id desc) from (select action,entity_id,actor_id,created_at,id from public.ec_team_audit where owner_id=owner order by created_at desc,id desc limit 50) a),'[]') else '[]'::jsonb end);
end $$;
create function public.ec_task_save(owner uuid,client uuid,assignee uuid,title text,due timestamptz,task uuid default null,done boolean default false) returns boolean language plpgsql security definer set search_path='' as $$ begin
 perform private.ec_assert(owner,'tasks');
 if not private.ec_scope(owner,client) then raise exception 'غير مسموح'; end if;
 if assignee<>owner and not exists(select 1 from public.ec_team where owner_id=owner and member_id=assignee and active and accepted_at is not null) then raise exception 'المسؤول غير متاح'; end if;
 if private.session_uid()<>owner and assignee<>private.session_uid() then raise exception 'لا يمكنك إسناد مهمة لمدرب آخر'; end if;
 if task is null then
  insert into public.ec_tasks(owner_id,client_id,assignee_id,title,due_at,source) values(owner,client,assignee,title,due,'manual:'||gen_random_uuid());
 else
  update public.ec_tasks set title=ec_task_save.title,due_at=due,status=case when done then 'done' else 'open' end,assignee_id=assignee
  where id=task and owner_id=owner and client_id=client and (private.session_uid()=owner or assignee_id=private.session_uid());
  if not found then raise exception 'المهمة غير متاحة'; end if;
 end if;
 insert into public.ec_team_audit(owner_id,actor_id,action,entity_id) values(owner,private.session_uid(),'task_save',client); return true;
end $$;
create function public.ec_rule_save(rule uuid,event_name text,threshold_value integer,action_name text,enabled boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare owner uuid:=private.session_uid(); begin
 perform private.ec_assert(owner,case when action_name='email' then 'reminders' else 'automation' end);
 if rule is null then insert into public.ec_rules(owner_id,event,threshold,action,enabled) values(owner,event_name,threshold_value,action_name,enabled);
 else update public.ec_rules set event=event_name,threshold=threshold_value,action=action_name,enabled=ec_rule_save.enabled where id=rule and owner_id=owner;
 if not found then raise exception 'قاعدة غير متاحة'; end if; end if; return true;
end $$;
-- Reports include only recorded receipts. No revenue is fabricated from client counts.
create function public.ec_report(owner uuid,branch uuid default null,member uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 perform private.ec_assert(owner,'reports_basic');
 if owner<>private.session_uid() and not exists(select 1 from public.ec_team where owner_id=owner and member_id=private.session_uid() and role='branch_manager' and active and accepted_at is not null) then raise exception 'غير مسموح'; end if;
 if branch is not null then perform private.ec_assert(owner,'branches'); end if;
 with scoped as (select c.id from public.clients c left join public.ec_assignments a on a.client_id=c.id where c.coach_id=owner and private.ec_scope(owner,c.id)
 and (branch is null or a.branch_id=branch) and (member is null or a.member_id=member))
 select jsonb_build_object('active_clients',(select count(*) from scoped),
 'attendance',(select count(*) from public.session_attendance where client_id in(select id from scoped)),
 'renewals',(select count(*) from public.subscriptions where previous_id is not null and client_id in(select id from scoped)),
 'paid_sar',case when exists(select 1 from public.payments p join public.subscriptions s on s.id=p.subscription_id where s.client_id in(select id from scoped)) then
 (select sum(p.amount) from public.payments p join public.subscriptions s on s.id=p.subscription_id where s.client_id in(select id from scoped)) end,
 'outstanding_sar',case when exists(select 1 from public.subscriptions where client_id in(select id from scoped)) then
 (select sum(greatest(s.price-coalesce((select sum(p.amount) from public.payments p where p.subscription_id=s.id),0),0)) from public.subscriptions s where s.client_id in(select id from scoped)) end)
 into result;
 return result;
end $$;

create function public.ec_bulk_apply(preview uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare p public.ec_bulk_previews; target uuid; t public.templates; begin
 select * into p from public.ec_bulk_previews where id=preview and actor_id=private.session_uid() for update;
 if not found or p.expires_at<=now() then raise exception 'انتهت المعاينة أو غير مسموح'; end if;
 if p.applied_at is not null then return true; end if;
 perform private.ec_assert(p.owner_id,'bulk');
 for target in select distinct value::uuid from jsonb_array_elements_text(p.body->'clients') loop
 if not private.ec_scope(p.owner_id,target) then raise exception 'تغير نطاق المتدرب'; end if;
 if p.operation='assign' then
  if p.body->>'member' is not null and not exists(select 1 from public.ec_team where owner_id=p.owner_id and member_id=(p.body->>'member')::uuid and active and accepted_at is not null) then raise exception 'تغيرت صلاحية المدرب'; end if;
  if p.body->>'branch' is not null and not exists(select 1 from public.ec_branches where owner_id=p.owner_id and id=(p.body->>'branch')::uuid and active) then raise exception 'الفرع غير متاح'; end if;
  insert into public.ec_assignments(owner_id,client_id,member_id,branch_id) values(p.owner_id,target,(p.body->>'member')::uuid,(p.body->>'branch')::uuid)
   on conflict(client_id) do update set member_id=excluded.member_id,branch_id=excluded.branch_id;
 elsif p.operation='program' then
  select * into t from public.templates where id=(p.body->>'template')::uuid and coach_id=p.owner_id;
  if not found or exists(select 1 from public.template_metadata where template_id=t.id and (archived or kind<>'workout')) then raise exception 'القالب غير متاح'; end if;
  if exists(select 1 from public.programs where client_id=target and published_at is null) then raise exception 'يوجد برنامج مسودة؛ لن يتم استبداله ضمن عملية جماعية'; end if;
  -- Reuse the existing assignment path: it preserves personal nutrition, strips
  -- template loading prescriptions, validates media and refuses draft replacement.
  perform public.management_command('template_assign',jsonb_build_object('id',t.id,'clients',jsonb_build_array(target),'replace_drafts',false,'publish',false));
 else
  insert into public.ec_email_outbox(owner_id,kind,period_ref,payload) values(p.owner_id,'bulk:'||p.id||':'||target,p.created_at,jsonb_build_object('client_id',target,'text',left(p.body->>'message',2000))) on conflict do nothing;
 end if;
 insert into public.ec_team_audit(owner_id,actor_id,action,entity_id) values(p.owner_id,p.actor_id,'bulk_'||p.operation,target);
 end loop;
 update public.ec_bulk_previews set applied_at=now() where id=p.id; return true;
end $$;

-- Revoke default PUBLIC function execution and all direct table access.
do $$ declare t text; f record; begin
 foreach t in array array['ec_branches','ec_team','ec_assignments','ec_tasks','ec_rules','ec_team_audit','ec_bulk_previews'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,coach_api',t);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('ec_assign_client','ec_team_homes','ec_org_page','ec_task_save','ec_rule_save','ec_report','ec_team_invite','ec_team_accept','ec_team_deactivate','ec_branch_save','ec_bulk_preview','ec_bulk_apply') loop
 execute format('revoke all on function %s from public,anon,authenticated,coach_api',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
revoke all on function private.ec_scope(uuid,uuid) from public,anon,authenticated,coach_api;
create function public.ec_team_options() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.member_id,'name',p.name) order by p.name),'[]') from public.ec_team m join public.profiles p on p.id=m.member_id
 where m.owner_id=private.session_uid() and m.active
$$;
revoke all on function public.ec_team_options() from public,anon,authenticated,coach_api;
grant execute on function public.ec_team_options() to authenticated;
