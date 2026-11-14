alter table public.ec_rules add column next_client uuid;
-- Every rule advances a cursor. 100 is a batch size, never a commercial limit.
create function public.ec_run_automation() returns integer language plpgsql security definer set search_path='' as $$
declare rule public.ec_rules; c record; sub public.subscriptions; remaining integer; last_activity timestamptz;
 matched boolean; period_ref timestamptz; task_source text; processed integer:=0; batch_count integer; last_client uuid; begin
 for rule in select * from public.ec_rules where enabled order by id for update skip locked loop
  if not private.ec_has(rule.owner_id,case when rule.action='email' then 'reminders' else 'automation' end) then continue; end if;
  batch_count:=0; last_client:=null;
  for c in select cl.id,case when exists(select 1 from public.ec_team m where m.owner_id=rule.owner_id and m.member_id=a.member_id and m.active and m.accepted_at is not null) then a.member_id end as member_id from public.clients cl left join public.ec_assignments a on a.client_id=cl.id
   where cl.coach_id=rule.owner_id and not cl.archived and private.ec_client_open(rule.owner_id,cl.id)
   and (rule.next_client is null or cl.id>rule.next_client) order by cl.id limit 100 loop
   batch_count:=batch_count+1;last_client:=c.id;matched:=false;
   select * into sub from public.subscriptions where client_id=c.id order by end_date desc limit 1;
   if rule.event='expiry' and sub.id is not null then
    matched:=sub.end_date>=(now() at time zone 'Asia/Riyadh')::date and sub.end_date<=(now() at time zone 'Asia/Riyadh')::date+rule.threshold;
    period_ref:=sub.end_date::timestamp at time zone 'Asia/Riyadh';
   elsif rule.event='low_sessions' and sub.session_limit is not null then
    select sub.session_limit-count(*) into remaining from public.session_attendance where subscription_id=sub.id;
    matched:=remaining<=rule.threshold and sub.end_date>=(now() at time zone 'Asia/Riyadh')::date;
    period_ref:=sub.start_date::timestamp at time zone 'Asia/Riyadh';
   elsif rule.event='inactive' then
    select greatest((select max(created_at) from public.session_attendance where client_id=c.id),
     (select max(created_at) from public.coaching_records where client_id=c.id and kind='workout_log'),
     (select created_at from public.clients where id=c.id)) into last_activity;
    matched:=last_activity<=now()-make_interval(days=>rule.threshold); period_ref:=last_activity;
   end if;
   if not matched then continue; end if;
   task_source:='rule:'||rule.id||':'||period_ref;
   if rule.action in ('task','both') then
    insert into public.ec_tasks(owner_id,client_id,assignee_id,title,due_at,source)
     values(rule.owner_id,c.id,coalesce(c.member_id,rule.owner_id),'متابعة: '||rule.event,now()+interval '1 day',task_source)
     on conflict(owner_id,client_id,source) do nothing;
   end if;
   if rule.action in ('email','both') then
    insert into public.ec_email_outbox(owner_id,kind,period_ref,payload) values(rule.owner_id,'rule:'||rule.id||':'||c.id,period_ref,
     jsonb_build_object('client_id',c.id,'event',rule.event,'threshold',rule.threshold)) on conflict do nothing;
   end if;
   processed:=processed+1;
  end loop;
  update public.ec_rules set next_client=case when batch_count=100 then last_client end where id=rule.id;
 end loop;
 return processed;
end $$;
create table public.ec_report_schedules (
 owner_id uuid primary key references public.ec_accounts(owner_id),next_run timestamptz not null,
 interval_days integer not null check(interval_days between 1 and 30),enabled boolean not null default true
);
alter table public.ec_report_schedules enable row level security;
revoke all on public.ec_report_schedules from public,anon,authenticated,coach_api;
create function public.ec_schedule_report(first_run timestamptz,every_days integer,enabled boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare owner uuid:=private.session_uid(); begin
 perform private.ec_assert(owner,'scheduled_reports');
 if first_run is null then raise exception 'اختر موعد التقرير'; end if;
 insert into public.ec_report_schedules(owner_id,next_run,interval_days,enabled) values(owner,first_run,every_days,enabled)
 on conflict(owner_id) do update set next_run=excluded.next_run,interval_days=excluded.interval_days,enabled=excluded.enabled;
 return true;
end $$;
-- Reports are queued for the owner only (authorized establishment administrator).
-- Email delivery remains disabled until a transactional email provider is configured.
create function public.ec_queue_reports() returns integer language plpgsql security definer set search_path='' as $$
declare schedule public.ec_report_schedules; count_reports integer:=0; payload jsonb; begin
 for schedule in select * from public.ec_report_schedules where enabled and next_run<=now() order by next_run limit 100 for update skip locked loop
 if not private.ec_has(schedule.owner_id,'scheduled_reports') then continue; end if;
 select jsonb_build_object('active_clients',(select count(*) from public.clients where coach_id=schedule.owner_id and not archived),
 'attendance',(select count(*) from public.session_attendance where coach_id=schedule.owner_id),
 'renewals',(select count(*) from public.subscriptions where coach_id=schedule.owner_id and previous_id is not null),
 'paid_sar',(select sum(amount) from public.payments where coach_id=schedule.owner_id)) into payload;
 insert into public.ec_email_outbox(owner_id,kind,period_ref,payload) values(schedule.owner_id,'scheduled_report',schedule.next_run,payload) on conflict do nothing;
 update public.ec_report_schedules set next_run=now()+make_interval(days=>schedule.interval_days) where owner_id=schedule.owner_id;
 count_reports:=count_reports+1;
 end loop;
 return count_reports;
end $$;
revoke all on function public.ec_run_automation(),public.ec_queue_reports(),public.ec_schedule_report(timestamptz,integer,boolean) from public,anon,authenticated,coach_api;
grant execute on function public.ec_schedule_report(timestamptz,integer,boolean) to authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.ec_run_automation(),public.ec_queue_reports() to service_role; end if;
end $$;
