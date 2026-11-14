-- EasyCoach platform subscriptions. Never touches public.subscriptions/payments
-- (those are the coach's trainee packages and ledger).
create table public.ec_plans (
 code text primary key check(code in ('free','starter','pro','business')),
 name_ar text not null, price_halalas integer not null check(price_halalas>=0),
 client_limit integer check(client_limit>=0), coach_limit integer not null check(coach_limit>0),
 template_limit integer check(template_limit>=0), features text[] not null
);
insert into public.ec_plans values
 ('free','المجانية',0,5,1,0,array['basics']),
 ('starter','الأساسية',29900,30,1,10,array['basics','programs','exercises','templates','measurements','import','reports_basic','expiry_email']),
 ('pro','الاحترافية',49900,50,3,null,array['basics','programs','exercises','templates','measurements','import','reports_basic','expiry_email','team','reports_advanced','workout_logs','reminders','branding','export']),
 ('business','الأعمال',69900,null,10,null,array['basics','programs','exercises','templates','measurements','import','reports_basic','expiry_email','team','reports_advanced','workout_logs','reminders','branding','export','branches','roles','automation','tasks','bulk','team_audit','scheduled_reports']);
create table public.ec_config (
 singleton boolean primary key default true check(singleton),
 discount_enabled boolean not null default false, discount_start timestamptz, discount_end timestamptz,
 trial_enabled boolean not null default false, trial_start timestamptz, trial_end timestamptz,
 reference_prices_approved boolean not null default false,
 tax_mode text not null default 'unconfigured' check(tax_mode in ('unconfigured','not_registered','inclusive','exclusive')),
 tax_bps integer check(tax_bps between 0 and 10000),
 -- Administrative evidence only. The application provider adapter also has to be implemented.
 provider_verified boolean not null default false,
 check(not discount_enabled or (discount_start is not null and discount_end is not null and discount_start<discount_end and reference_prices_approved)),
 check(not trial_enabled or (trial_start is not null and trial_end is not null and trial_start<trial_end)),
 check(tax_mode in ('unconfigured','not_registered') or tax_bps is not null)
);
insert into public.ec_config(singleton) values(true);
create table public.ec_accounts (
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 mode text not null default 'managed' check(mode in ('legacy','managed')),
 billing_plan text not null default 'free' references public.ec_plans(code),
 status text not null default 'free' check(status in ('free','trialing','active','past_due','expired')),
 trial_used_at timestamptz, trial_start timestamptz, trial_end timestamptz,
 period_start timestamptz, period_end timestamptz,
 cancel_at_period_end boolean not null default false, provider_canceled_at timestamptz,
 recurring_ref text unique, payment_method_ref text,
 locked_price_halalas integer check(locked_price_halalas>=0),
 locked_total_halalas integer check(locked_total_halalas>=0),
 locked_tax_mode text, locked_tax_bps integer, discount_qualified boolean not null default false,
 -- Null means selection required when usage exceeds limits. [] explicitly locks everything.
 selected_clients uuid[], selected_templates uuid[],
 created_at timestamptz not null default now(),
 check(status<>'trialing' or (trial_used_at is not null and trial_end=trial_start+interval '336 hours')),
 check(status not in ('trialing','active') or (billing_plan<>'free' and locked_total_halalas is not null))
);
-- Existing accounts retain their current permissions. No subscription/price is migrated silently.
insert into public.ec_accounts(owner_id,mode) select id,'legacy' from public.profiles where role='coach';
create function private.ec_profile_created() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.role='coach' then insert into public.ec_accounts(owner_id) values(new.id) on conflict do nothing; end if;
 return new;
end $$;
create trigger ec_profile_created after insert on public.profiles for each row execute function private.ec_profile_created();
-- Close the onboarding race between the initial backfill and installation of
-- the profile trigger. The DDL lock serializes concurrent profile creation.
insert into public.ec_accounts(owner_id,mode) select id,'legacy' from public.profiles where role='coach' on conflict do nothing;
create index ec_accounts_due on public.ec_accounts(status,trial_end,period_end) where mode='managed';
create table public.ec_consents (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.ec_accounts(owner_id),
 plan text not null references public.ec_plans(code), quote jsonb not null,
 accepted_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 minutes',
 terms_version text not null default 'ec-monthly-v1', consumed_at timestamptz
);
create table public.ec_invoices (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.ec_accounts(owner_id),
 cycle_start timestamptz not null, cycle_end timestamptz not null check(cycle_end>cycle_start),
 plan text not null references public.ec_plans(code), amount_halalas integer not null check(amount_halalas>0),
 currency text not null default 'SAR' check(currency='SAR'), provider_order text not null unique,
 transaction_ref text unique, status text not null default 'pending' check(status in ('pending','paid','failed','review')),
 paid_at timestamptz, review_reason text, created_at timestamptz not null default now(),
 unique(owner_id,cycle_start)
);
create index ec_invoices_owner_page on public.ec_invoices(owner_id,created_at desc,id);
create table public.ec_events (
 provider_event text primary key, invoice_id uuid references public.ec_invoices(id),
 outcome text not null, received_at timestamptz not null default now()
);
create table public.ec_email_outbox (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.ec_accounts(owner_id),
 kind text not null, period_ref timestamptz not null, payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','sent','failed')),
 created_at timestamptz not null default now(), unique(owner_id,kind,period_ref)
);
create index ec_email_pending on public.ec_email_outbox(created_at) where status='pending';
create function private.ec_plan(owner uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select case when mode='legacy' then 'business'
 when status='trialing' and trial_end>now() then 'business'
 when status='active' and period_end>now() then billing_plan else 'free' end
 from public.ec_accounts where owner_id=owner),'free')
$$;
create function private.ec_has(owner uuid,feature text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select feature=any(features) from public.ec_plans where code=private.ec_plan(owner)),false)
$$;
create function private.ec_assert(owner uuid,feature text) returns void language plpgsql stable security definer set search_path='' as $$ begin
 if not private.ec_has(owner,feature) then raise exception 'تحتاج هذه الميزة (%) إلى ترقية باقة EasyCoach: /subscription',feature using errcode='P0403'; end if;
end $$;
create function public.ec_quote(plan_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.ec_plans; c public.ec_config; a public.ec_accounts; discount boolean; net integer; vat integer; total integer; begin
 select * into p from public.ec_plans where code=plan_code; if not found then raise exception 'باقة غير صالحة'; end if;
 select * into c from public.ec_config;
 select * into a from public.ec_accounts where owner_id=private.session_uid();
 discount:=p.code<>'free' and c.discount_enabled and c.reference_prices_approved and now()>=c.discount_start and now()<c.discount_end;
 net:=case when discount then ((p.price_halalas::bigint*80+50)/100)::int else p.price_halalas end;
 -- A continuous subscriber retains eligibility on a plan change, not an unrelated account.
 if p.code<>'free' and a.discount_qualified and ((a.status='trialing' and a.trial_end>now()) or (a.status='active' and a.period_end>now())) then
  discount:=true; net:=((p.price_halalas::bigint*80+50)/100)::int;
 end if;
 if p.code=a.billing_plan and ((a.status='trialing' and a.trial_end>now()) or (a.status='active' and a.period_end>now())) then
  net:=a.locked_price_halalas; c.tax_mode:=a.locked_tax_mode; c.tax_bps:=a.locked_tax_bps; discount:=a.discount_qualified;
 end if;
 if c.tax_mode='not_registered' then vat:=0; total:=net;
 elsif c.tax_mode='exclusive' then vat:=round(net::numeric*c.tax_bps/10000)::int; total:=net+vat;
 elsif c.tax_mode='inclusive' then total:=net; vat:=net-round(net::numeric*10000/(10000+c.tax_bps))::int;
 end if;
 return jsonb_build_object('plan',p.code,'base_halalas',p.price_halalas,'net_halalas',net,'vat_halalas',vat,'total_halalas',total,
 'limits',jsonb_build_object('clients',p.client_limit,'coaches',p.coach_limit,'templates',p.template_limit),
 'tax_mode',c.tax_mode,'discount',discount,'campaign_active',c.discount_enabled and now()>=c.discount_start and now()<c.discount_end,
 'trial_available',p.code<>'free' and c.trial_enabled and now()>=c.trial_start and now()<c.trial_end and a.trial_used_at is null,
 'provider_ready',false,'server_now',now());
end $$;
create function public.ec_subscription() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.ec_accounts; p public.ec_plans; clients integer; templates integer; begin
 select * into a from public.ec_accounts where owner_id=private.session_uid();
 if not found then raise exception 'هذه الصفحة لمالك حساب مدرب' using errcode='P0403'; end if;
 select * into p from public.ec_plans where code=private.ec_plan(a.owner_id);
 select count(*) into clients from public.clients where coach_id=a.owner_id and not archived;
 select count(*) into templates from public.templates t where coach_id=a.owner_id and not exists(select 1 from public.template_metadata m where m.template_id=t.id and m.archived);
 return jsonb_build_object('mode',a.mode,'status',case when a.status='trialing' and a.trial_end<=now() then case when a.cancel_at_period_end then 'expired' else 'past_due' end when a.status='active' and a.period_end<=now() then case when a.cancel_at_period_end then 'expired' else 'past_due' end else a.status end,
 'billing_plan',a.billing_plan,'effective_plan',p.code,'cancel_at_period_end',a.cancel_at_period_end,'trial_end',a.trial_end,'trial_used_at',a.trial_used_at,
 'period_end',a.period_end,'locked_price_halalas',a.locked_price_halalas,'total_halalas',a.locked_total_halalas,'currency','SAR',
 'usage',jsonb_build_object('clients',clients,'templates',templates,'coaches',(select count(*)+1 from public.ec_team where owner_id=a.owner_id and active)),
 'limits',jsonb_build_object('clients',p.client_limit,'templates',p.template_limit,'coaches',p.coach_limit),
 'billing_limits',(select jsonb_build_object('clients',client_limit,'coaches',coach_limit,'templates',template_limit) from public.ec_plans where code=a.billing_plan),
 'locked_clients',a.selected_clients,'locked_templates',a.selected_templates,'features',p.features,'server_now',now());
end $$;
-- Limit checks are in triggers, inside the import transaction as well as individual RPCs.
-- A stable parent row serializes every creation/reactivation for the same tenant.
create function private.ec_guard_resource() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; p public.ec_plans; used integer; feature text; begin
 select * into a from public.ec_accounts where owner_id=new.coach_id for update;
 if a.mode='legacy' then return new; end if;
 select * into p from public.ec_plans where code=private.ec_plan(new.coach_id);
 if tg_table_name='clients' then
  if tg_op='UPDATE' and old.coach_id<>new.coach_id then raise exception 'لا يمكن تغيير مالك المتدرب'; end if;
  if new.archived then return new; end if;
  if tg_op='UPDATE' and not old.archived then
   if not private.ec_client_open(new.coach_id,new.id) then raise exception 'هذا المتدرب مقفل؛ اختر النشطين من صفحة الاشتراك' using errcode='P0403'; end if;
   return new;
  end if;
  select count(*) into used from public.clients where coach_id=new.coach_id and not archived;
  if p.client_limit is not null and used>=p.client_limit then raise exception 'وصلت إلى حد المتدربين النشطين (%)؛ أرشف متدربًا أو رقّ الباقة',p.client_limit using errcode='P0403'; end if;
 elsif tg_table_name='templates' then
  perform private.ec_assert(new.coach_id,'templates');
  if tg_op='UPDATE' then
   if not private.ec_template_open(new.coach_id,new.id) then raise exception 'هذا القالب مقفل'; end if;
  else
   select count(*) into used from public.templates t where coach_id=new.coach_id and not exists(select 1 from public.template_metadata m where m.template_id=t.id and m.archived);
   if p.template_limit is not null and used>=p.template_limit then raise exception 'وصلت إلى حد القوالب الخاصة (%)',p.template_limit using errcode='P0403'; end if;
  end if;
 else
  feature:=case tg_table_name when 'programs' then 'programs' when 'exercises' then 'exercises'
   when 'weight_entries' then 'measurements' when 'progress_photos' then 'measurements'
   when 'media_assets' then 'exercises' when 'upload_sessions' then 'exercises' when 'client_goals' then 'programs'
   when 'coach_branding' then 'branding' when 'coaching_records' then case when (to_jsonb(new)->>'kind')='workout_log' then 'workout_logs' when (to_jsonb(new)->>'kind') in ('note','message') then 'basics' else 'measurements' end end;
  if feature is not null then perform private.ec_assert(new.coach_id,feature); end if;
  if to_jsonb(new) ? 'client_id' and a.selected_clients is not null and not (to_jsonb(new)->>'client_id')::uuid=any(a.selected_clients) then
   raise exception 'هذا المتدرب مقفل؛ اختر النشطين من صفحة الاشتراك' using errcode='P0403';
  end if;
 end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['clients','templates','programs','exercises','weight_entries','progress_photos','coaching_records','media_assets','upload_sessions','client_goals'] loop
 execute format('create trigger ec_resource_guard before insert or update on public.%I for each row execute function private.ec_guard_resource()',t);
 end loop;
end $$;
-- Guard RPC entry points too: importing even existing rows requires Starter.
-- Renaming retains the original ACLs; their private entry points are guarded below as well.
create table private.ec_rpc_backup(signature text primary key,definition text not null);
revoke all on private.ec_rpc_backup from public,anon,authenticated,coach_api;
do $$ declare f regprocedure; def text; needle text; begin
 foreach f in array array['private.app_command(text,jsonb)'::regprocedure,'private.management_command(text,jsonb)'::regprocedure] loop
 select pg_get_functiondef(f) into def;
 insert into private.ec_rpc_backup values(f::text,def);
 needle:='begin';
 -- Case-insensitive first BEGIN, retaining function ownership and every existing check.
 def:=regexp_replace(def,'\mBEGIN\M', E'BEGIN\n if command in (''import_clients'',''import_apply'',''import_management'',''import_data'') then perform private.ec_assert(private.session_uid(),''import''); end if;\n', 'i');
 execute def;
 end loop;
end $$;
create function public.ec_require(feature text) returns boolean language plpgsql stable security definer set search_path='' as $$ begin
 if not exists(select 1 from public.ec_accounts where owner_id=private.session_uid()) then raise exception 'غير مسموح'; end if;
 perform private.ec_assert(private.session_uid(),feature); return true;
end $$;
-- Explicit non-destructive selection after a downgrade. Data is retained.
create function public.ec_select_resources(clients uuid[],templates uuid[]) returns boolean language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; p public.ec_plans; begin
 select * into a from public.ec_accounts where owner_id=private.session_uid() for update;
 if not found then raise exception 'غير مسموح'; end if;
 select * into p from public.ec_plans where code=private.ec_plan(a.owner_id);
 if clients is null or templates is null then raise exception 'اختر القوائم صراحة'; end if;
 if (p.client_limit is not null and cardinality(clients)>p.client_limit) or (p.template_limit is not null and cardinality(templates)>p.template_limit) then raise exception 'الاختيار يتجاوز حدود الباقة'; end if;
 if exists(select unnest(clients) except select id from public.clients where coach_id=a.owner_id and not archived)
 or exists(select unnest(templates) except select id from public.templates where coach_id=a.owner_id) then raise exception 'اختيار غير مسموح'; end if;
 update public.ec_accounts set selected_clients=clients,selected_templates=templates where owner_id=a.owner_id;
 return true;
end $$;
-- Trusted-provider transitions only. There is deliberately no public "start trial" mutation.
create function public.ec_confirm_setup(consent_id uuid,provider_reference text,method_reference text) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.ec_consents; a public.ec_accounts; cfg public.ec_config; q jsonb; begin
 select * into cfg from public.ec_config;
 if not cfg.provider_verified then raise exception 'Paylink setup is not verified'; end if;
 select * into c from public.ec_consents where id=consent_id for update;
 if not found then raise exception 'Consent expired or already used'; end if;
 if c.consumed_at is not null then
  if exists(select 1 from public.ec_accounts where owner_id=c.owner_id and recurring_ref=provider_reference and payment_method_ref=method_reference) then return true; end if;
  raise exception 'Consent expired or already used';
 end if;
 if c.expires_at<=now() then raise exception 'Consent expired or already used'; end if;
 select * into a from public.ec_accounts where owner_id=c.owner_id for update;
 if a.trial_used_at is not null or a.status not in ('free','expired') then raise exception 'Trial already used or subscription exists'; end if;
 if length(coalesce(provider_reference,'')) not between 1 and 160 or length(coalesce(method_reference,'')) not between 1 and 160 then raise exception 'Provider confirmation required'; end if;
 -- Campaign and money are fixed at actual confirmation, never at page load.
 q:=public.ec_quote(c.plan);
 -- ec_quote is actor-aware; trusted setup uses the accepted quote only when still fresh and campaign eligible.
 if not cfg.trial_enabled or now()<cfg.trial_start or now()>=cfg.trial_end then raise exception 'Trial campaign inactive'; end if;
 if (q->>'net_halalas')::int is distinct from (c.quote->>'net_halalas')::int or (q->>'tax_mode') is distinct from (c.quote->>'tax_mode') or (q->>'total_halalas')::int is distinct from (c.quote->>'total_halalas')::int or q->>'total_halalas' is null then raise exception 'Price changed; new consent required'; end if;
 update public.ec_accounts set mode='managed',billing_plan=c.plan,status='trialing',trial_used_at=now(),trial_start=now(),trial_end=now()+interval '336 hours',
  locked_price_halalas=(q->>'net_halalas')::int,locked_total_halalas=(q->>'total_halalas')::int,locked_tax_mode=q->>'tax_mode',locked_tax_bps=cfg.tax_bps,
  discount_qualified=(q->>'discount')::boolean,recurring_ref=provider_reference,payment_method_ref=method_reference,cancel_at_period_end=false,
  selected_clients=null,selected_templates=null where owner_id=a.owner_id;
 update public.ec_consents set consumed_at=now() where id=c.id;
 return true;
end $$;
-- Invoice binding is written only by the future verified provider adapter.
-- Provider timestamps/cycles must be read from the provider; reaching a date grants nothing.
create function public.ec_record_payment(event_ref text,invoice uuid,transaction text,amount integer,currency_code text,paid boolean) returns text language plpgsql security definer set search_path='' as $$
declare i public.ec_invoices; a public.ec_accounts; result text; begin
 select * into i from public.ec_invoices where id=invoice for update;
 if not found then raise exception 'Unknown invoice'; end if;
 select * into a from public.ec_accounts where owner_id=i.owner_id for update;
 if exists(select 1 from public.ec_events where provider_event=event_ref) then return 'duplicate'; end if;
 if i.status='paid' then result:='duplicate';
 elsif i.amount_halalas is distinct from amount or currency_code is distinct from 'SAR' or transaction is null or length(transaction) not between 1 and 160
 or a.recurring_ref is null or a.provider_canceled_at is not null or a.status='expired'
 or i.plan<>a.billing_plan or i.amount_halalas is distinct from a.locked_total_halalas
 or i.cycle_start>now() or (a.period_end is not null and i.cycle_end<=a.period_end)
 or (a.status='trialing' and i.cycle_start is distinct from a.trial_end)
 or (a.period_end is not null and i.cycle_start is distinct from a.period_end) then
  result:='review'; update public.ec_invoices set status='review',review_reason='binding_amount_currency_or_cycle' where id=i.id;
 elsif paid is not true then
  result:='failed'; update public.ec_invoices set status='failed' where id=i.id;
  if coalesce(a.trial_end,a.period_end)<=now() then update public.ec_accounts set status='past_due' where owner_id=a.owner_id; end if;
 else
  result:='applied';
  update public.ec_invoices set status='paid',transaction_ref=transaction,paid_at=now() where id=i.id;
  update public.ec_accounts set status='active',billing_plan=i.plan,period_start=i.cycle_start,period_end=i.cycle_end where owner_id=a.owner_id;
 end if;
 insert into public.ec_events(provider_event,invoice_id,outcome) values(event_ref,i.id,result);
 return result;
end $$;
-- Cancellation must already have been confirmed by the provider before calling this.
create function public.ec_confirm_cancel(owner uuid,provider_reference text) returns boolean language plpgsql security definer set search_path='' as $$ begin
 update public.ec_accounts set cancel_at_period_end=true,provider_canceled_at=now() where owner_id=owner and recurring_ref=provider_reference;
 if not found then raise exception 'Unknown provider binding'; end if; return true;
end $$;
create function public.ec_reconcile() returns jsonb language plpgsql security definer set search_path='' as $$
declare count_expired integer; begin
 insert into public.ec_email_outbox(owner_id,kind,period_ref,payload)
 select owner_id,case when trial_end-now()>interval '1 day' then 'trial_3_days' else 'trial_1_day' end,trial_end,
 jsonb_build_object('billing_plan',billing_plan,'total_halalas',locked_total_halalas,'trial_end',trial_end,'cancel_at_period_end',cancel_at_period_end)
 from public.ec_accounts where mode='managed' and status='trialing' and trial_end>now() and trial_end<=now()+interval '3 days'
 on conflict(owner_id,kind,period_ref) do nothing;
 update public.ec_accounts set status=case when cancel_at_period_end then 'expired' else 'past_due' end,
 discount_qualified=case when cancel_at_period_end then false else discount_qualified end
 where mode='managed' and ((status='trialing' and trial_end<=now()) or (status='active' and period_end<=now()));
 get diagnostics count_expired=row_count;
 return jsonb_build_object('expired',count_expired,'server_now',now());
end $$;
-- Pagination for billing history, with a hard per-request bound.
create function public.ec_invoice_page(before_date timestamptz default null,before_id uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(i)-'provider_order'-'transaction_ref'-'review_reason' order by i.created_at desc,i.id desc),'[]') from
 (select * from public.ec_invoices where owner_id=private.session_uid() and (before_date is null or created_at<before_date or (created_at=before_date and id<before_id)) order by created_at desc,id desc limit 50) i
$$;
-- Lock reads of paid data at the database boundary, even via the REST API.
-- Restrictive policies compose with all pre-existing tenant/portal policies.
do $$ declare t text; feature text; begin
 foreach t in array array['programs','exercises','templates','weight_entries','progress_photos'] loop
 feature:=case t when 'programs' then 'programs' when 'exercises' then 'exercises' when 'templates' then 'templates' else 'measurements' end;
 execute format('create policy ec_feature_read on public.%I as restrictive for select to authenticated,coach_api using(private.ec_has(coach_id,%L))',t,feature);
 end loop;
end $$;
-- Only narrowly scoped functions expose platform billing. No client writes.
do $$ declare t text; f record; begin
 foreach t in array array['ec_plans','ec_config','ec_accounts','ec_consents','ec_invoices','ec_events','ec_email_outbox'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,coach_api',t);
 end loop;
 for f in select p.oid::regprocedure as signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'ec_%') or (n.nspname='private' and p.proname like 'ec_%') loop
 execute format('revoke all on function %s from public,anon,authenticated,coach_api',f.signature);
 end loop;
end $$;
grant execute on function public.ec_quote(text) to anon,authenticated;
grant execute on function public.ec_subscription(),public.ec_require(text),public.ec_select_resources(uuid[],uuid[]),public.ec_invoice_page(timestamptz,uuid) to authenticated;
grant execute on function private.ec_plan(uuid),private.ec_has(uuid,text),private.ec_assert(uuid,text) to authenticated,coach_api;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.ec_confirm_setup(uuid,text,text),public.ec_confirm_cancel(uuid,text),public.ec_record_payment(text,uuid,text,integer,text,boolean),public.ec_reconcile() to service_role;
 end if;
end $$;
