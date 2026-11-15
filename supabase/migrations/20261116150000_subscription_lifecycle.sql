-- Additive, card-less lifecycle. Historical accounts and trainee ledgers remain intact.
create type public.ec_subscription_state as enum ('NOT_STARTED','TRIAL_ACTIVE','TRIAL_ENDING','AWAITING_PAYMENT','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','PAYMENT_FAILED','PROVIDER_NOT_READY','TAX_NOT_CONFIGURED');
alter table public.ec_accounts
 add column lifecycle_enabled boolean not null default false,
 add column subscription_state public.ec_subscription_state not null default 'NOT_STARTED',
 add column billing_block public.ec_subscription_state,
 add column billing_payment_failed boolean not null default false,
 add column billing_mobile text,
 add column billing_name text,
 add column billing_checked_at timestamptz,
 add column cancelled_at timestamptz;
-- Existing trials keep their start/end and gain the new grace period; paid
-- periods keep their already-promised end date. Future payments cover 30 days.
update public.ec_accounts set lifecycle_enabled=true where mode='managed' and (trial_used_at is not null or period_end is not null);
alter table public.ec_invoices add column due_at timestamptz;
create unique index ec_invoice_billing_period on public.ec_invoices(owner_id,due_at) where due_at is not null;
create table private.ec_payment_attempts (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.ec_invoices(id),
 order_no text not null unique default ('ECP-'||replace(gen_random_uuid()::text,'-','')),
 transaction_no text unique, amount_halalas integer not null check(amount_halalas>0),
 status text not null default 'reserved' check(status in ('reserved','pending','paid','failed','cancelled','review')),
 raw_provider_status text, payment_errors jsonb not null default '[]',
 payment_url text, paid_at timestamptz, verified_at timestamptz, created_at timestamptz not null default now()
);
revoke all on private.ec_payment_attempts from public,anon,authenticated;
create table public.ec_billing_notifications (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.ec_accounts(owner_id) on delete cascade,
 kind text not null, notification_date date not null, body text not null, created_at timestamptz not null default now(),
 unique(owner_id,kind,notification_date)
);
alter table public.ec_billing_notifications enable row level security;
create policy ec_billing_notifications_owner on public.ec_billing_notifications for select to authenticated using(owner_id=private.session_uid());
grant select on public.ec_billing_notifications to authenticated;
revoke insert,update,delete on public.ec_billing_notifications from anon,authenticated;

create function private.ec_billing_value(a public.ec_accounts) returns public.ec_subscription_state
language plpgsql stable set search_path='' as $$
declare due timestamptz:=coalesce(a.period_end,a.trial_end); pending boolean; base public.ec_subscription_state; begin
 if a.cancelled_at is not null then return case when coalesce(a.period_end,a.trial_end)>now() then 'CANCELLED' else 'SUSPENDED' end; end if;
 select exists(select 1 from public.ec_invoices i where i.owner_id=a.owner_id and i.due_at=due and i.status in ('pending','failed','review')) into pending;
 if a.period_end>now() then base:=case when pending then 'AWAITING_PAYMENT' else 'ACTIVE' end;
 elsif a.trial_end>now() then base:=case when a.trial_end<=now()+interval '3 days' then 'TRIAL_ENDING' else 'TRIAL_ACTIVE' end;
 elsif due is not null then
  if now()>=due+interval '3 days' then return 'SUSPENDED'; end if;
  base:=case when a.period_end is not null then 'PAST_DUE' else 'AWAITING_PAYMENT' end;
 else base:='NOT_STARTED'; end if;
 if a.billing_block is not null then return a.billing_block; end if;
 if a.billing_payment_failed and base in ('AWAITING_PAYMENT','PAST_DUE') then return 'PAYMENT_FAILED'; end if;
 return base;
end $$;
create function private.ec_billing_refresh(owner uuid) returns void language plpgsql security definer set search_path='' as $$
begin update public.ec_accounts a set subscription_state=private.ec_billing_value(a) where owner_id=owner and lifecycle_enabled; end $$;

-- Entitlements use trusted dates, including grace, even when the hourly cron is late.
create or replace function private.ec_plan(owner uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare a public.ec_accounts; begin
 select * into a from public.ec_accounts where owner_id=owner;
 if not found then return 'free'; end if;
 if a.mode='legacy' then return 'business'; end if;
 if not a.lifecycle_enabled then
  return case when a.status='trialing' and a.trial_end>now() then 'business' when a.status='active' and a.period_end>now() then a.billing_plan else 'free' end;
 end if;
 if a.cancelled_at is not null then
  return case when a.period_end>now() then a.billing_plan when a.period_end is null and a.trial_end>now() then 'business' else 'free' end;
 end if;
 if a.period_end is not null then return case when a.period_end+interval '3 days'>now() then a.billing_plan else 'free' end; end if;
 return case when a.trial_end+interval '3 days'>now() then 'business' else 'free' end;
end $$;

create function private.ec_billing_quote(owner uuid,plan_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.ec_plans; c public.ec_config; a public.ec_accounts; net integer; vat integer; total integer; discount boolean; begin
 select * into p from public.ec_plans where code=plan_code; if not found then raise exception 'invalid_plan'; end if;
 select * into c from public.ec_config; select * into a from public.ec_accounts where owner_id=owner;
 discount:=p.code<>'free' and c.discount_enabled and c.reference_prices_approved and now()>=c.discount_start and now()<c.discount_end;
 net:=case when discount then ((p.price_halalas::bigint*80+50)/100)::int else p.price_halalas end;
 if p.code<>'free' and a.discount_qualified and ((a.status='trialing' and a.trial_end>now()) or (a.status='active' and a.period_end>now())) then
  discount:=true; net:=((p.price_halalas::bigint*80+50)/100)::int;
 end if;
 if p.code=a.billing_plan and ((a.status='trialing' and a.trial_end>now()) or (a.status='active' and a.period_end>now())) and a.locked_price_halalas is not null then
  net:=a.locked_price_halalas; discount:=a.discount_qualified; c.tax_mode:=a.locked_tax_mode; c.tax_bps:=a.locked_tax_bps;
 end if;
 if c.tax_mode='not_registered' then vat:=0; total:=net;
 elsif c.tax_mode='exclusive' then vat:=round(net::numeric*c.tax_bps/10000)::int; total:=net+vat;
 elsif c.tax_mode='inclusive' then total:=net; vat:=net-round(net::numeric*10000/(10000+c.tax_bps))::int; end if;
 return jsonb_build_object('plan',p.code,'base_halalas',p.price_halalas,'net_halalas',net,'vat_halalas',vat,'total_halalas',total,'tax_mode',c.tax_mode,'tax_bps',c.tax_bps,'discount',discount,
 'campaign_active',discount,'limits',jsonb_build_object('clients',p.client_limit,'coaches',p.coach_limit,'templates',p.template_limit),
 'trial_available',p.code<>'free' and c.trial_enabled and now()>=c.trial_start and now()<c.trial_end and a.mode='managed' and a.trial_used_at is null and a.period_end is null,
 'trial_campaign_active',c.trial_enabled and now()>=c.trial_start and now()<c.trial_end,'trial_campaign_end',c.trial_end,'trial_days',14,'trial_used',a.trial_used_at is not null,
 'provider_ready',c.provider_verified,'server_now',now());
end $$;
create or replace function public.ec_quote(plan_code text) returns jsonb language sql stable security definer set search_path='' as $$ select private.ec_billing_quote(private.session_uid(),plan_code) $$;
create function public.ec_billing_config() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('verified',provider_verified,'tax_ready',tax_mode<>'unconfigured','tax_mode',tax_mode) from public.ec_config
$$;
alter function public.ec_subscription() rename to ec_subscription_before_lifecycle;
create function public.ec_subscription() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.ec_accounts; j jsonb; begin
 j:=public.ec_subscription_before_lifecycle(); select * into a from public.ec_accounts where owner_id=private.session_uid();
 return j||jsonb_build_object('subscription_state',case when a.lifecycle_enabled then private.ec_billing_value(a) else a.subscription_state end,
 'lifecycle_enabled',a.lifecycle_enabled,'paid_until',a.period_end,'grace_ends_at',case when a.cancelled_at is null then coalesce(a.period_end,a.trial_end)+interval '3 days' else coalesce(a.period_end,a.trial_end) end,
 'cancelled_at',a.cancelled_at,'billing_mobile',a.billing_mobile,'has_payment_method',false);
end $$;

-- All writes below are service-only; browser RPCs cannot bypass environment gating.
create function public.ec_billing_start(owner uuid,plan_code text,mobile text,customer_name text,accepted_version text) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; q jsonb; begin
 select * into a from public.ec_accounts where owner_id=owner for update;
 if not found or a.mode<>'managed' or not exists(select 1 from auth.users where id=owner and email_confirmed_at is not null) then raise exception 'owner_required'; end if;
 if accepted_version is distinct from '2026-11-15.2' then raise exception 'terms_required'; end if;
 if mobile is null or mobile !~ '^05[0-9]{8}$' then raise exception 'mobile_required'; end if;
 if plan_code is null or plan_code not in ('starter','pro','business') then raise exception 'invalid_plan'; end if;
 if not (select provider_verified from public.ec_config) then raise exception 'provider_not_ready'; end if;
 q:=private.ec_billing_quote(owner,plan_code);
 if q->>'total_halalas' is null then raise exception 'tax_not_configured'; end if;
 if a.trial_used_at is not null or a.period_end is not null or a.cancelled_at is not null then raise exception 'trial_used'; end if;
 if not coalesce((q->>'trial_available')::boolean,false) then raise exception 'trial_unavailable'; end if;
 update public.ec_accounts set lifecycle_enabled=true,subscription_state='TRIAL_ACTIVE',status='trialing',billing_plan=plan_code,
 trial_used_at=now(),trial_start=now(),trial_end=now()+interval '336 hours',billing_mobile=mobile,billing_name=left(customer_name,120),
 locked_price_halalas=(q->>'net_halalas')::int,locked_total_halalas=(q->>'total_halalas')::int,locked_tax_mode=q->>'tax_mode',locked_tax_bps=(q->>'tax_bps')::int,
 discount_qualified=(q->>'discount')::boolean,cancel_at_period_end=false,recurring_ref=null,payment_method_ref=null,billing_block=null
 where owner_id=owner;
 insert into public.ec_trial_consents(owner_id,plan,policy_version,quote) values(owner,plan_code,accepted_version,q);
 return true;
end $$;

create function public.ec_billing_prepare(owner uuid,plan_code text,expected_total integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; i public.ec_invoices; p private.ec_payment_attempts; q jsonb; due timestamptz; begin
 select * into a from public.ec_accounts where owner_id=owner for update;
 if not found or not a.lifecycle_enabled or a.mode<>'managed' then raise exception 'owner_required'; end if;
 if a.billing_mobile is null or a.billing_mobile !~ '^05[0-9]{8}$' then raise exception 'mobile_required'; end if;
 if a.recurring_ref is not null then raise exception 'provider_not_ready'; end if;
 if a.cancelled_at is not null then raise exception 'subscription_cancelled'; end if;
 if not (select provider_verified from public.ec_config) then raise exception 'provider_not_ready'; end if;
 due:=coalesce(a.period_end,a.trial_end);
 if (a.period_end is null and a.trial_end>now()) or (a.period_end>now()+interval '5 days') then raise exception 'period_running'; end if;
 if plan_code is null or plan_code not in ('starter','pro','business') then raise exception 'invalid_plan'; end if;
 q:=private.ec_billing_quote(owner,plan_code);
 if (q->>'total_halalas')::int is null then raise exception 'tax_not_configured'; end if;
 if expected_total is not null and expected_total<>(q->>'total_halalas')::int then raise exception 'quote_changed'; end if;
 select * into i from public.ec_invoices where owner_id=owner and due_at=due for update;
 if found then
  if i.plan<>plan_code then raise exception 'pending_invoice'; end if;
  if expected_total is not null and expected_total<>i.amount_halalas then raise exception 'quote_changed'; end if;
  if i.status in ('paid','review') then raise exception 'payment_review'; end if;
 else
  insert into public.ec_invoices(owner_id,cycle_start,cycle_end,plan,amount_halalas,provider_order,due_at)
  values(owner,due,due+interval '30 days',plan_code,(q->>'total_halalas')::int,'ECP-'||replace(gen_random_uuid()::text,'-',''),due) returning * into i;
  insert into private.ec_paylink_checkouts(invoice_id,quote,policy_version) values(i.id,q,'2026-11-15.2');
 end if;
 select * into p from private.ec_payment_attempts where invoice_id=i.id order by created_at desc,id desc limit 1;
 if found and p.status not in ('cancelled') then
  return to_jsonb(p)||jsonb_build_object('created',false,'plan',i.plan,'owner_id',owner,'customer_name',a.billing_name,'mobile',a.billing_mobile);
 end if;
 if (select count(*) from private.ec_payment_attempts where invoice_id=i.id and created_at>now()-interval '1 hour')>=10 then raise exception 'rate_limited'; end if;
 insert into private.ec_payment_attempts(invoice_id,amount_halalas) values(i.id,i.amount_halalas) returning * into p;
 update public.ec_invoices set status='pending' where id=i.id;
 update public.ec_accounts set billing_payment_failed=false,billing_block=null where owner_id=owner;
 perform private.ec_billing_refresh(owner);
 return to_jsonb(p)||jsonb_build_object('created',true,'plan',i.plan,'owner_id',owner,'customer_name',a.billing_name,'mobile',a.billing_mobile);
end $$;
create function public.ec_billing_attach(attempt uuid,transaction text,url text) returns boolean language plpgsql security definer set search_path='' as $$ begin
 update private.ec_payment_attempts set transaction_no=transaction,payment_url=url,status=case when status='reserved' then 'pending' else status end
 where id=attempt and (transaction_no is null or transaction_no=transaction);
 if not found then raise exception 'invoice_conflict'; end if; return true;
end $$;
create function public.ec_billing_lookup(transaction text,order_no text) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p)||jsonb_build_object('owner_id',i.owner_id) from private.ec_payment_attempts p join public.ec_invoices i on i.id=p.invoice_id
 where (transaction is not null and transaction_no=transaction) or (order_no is not null and p.order_no=ec_billing_lookup.order_no) limit 1
$$;
create function public.ec_billing_settle(attempt uuid,transaction text,order_no text,amount integer,currency_code text,provider_status text,provider_paid_at timestamptz,errors jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare p private.ec_payment_attempts; i public.ec_invoices; a public.ec_accounts; q jsonb; paid timestamptz; begin
 select e.* into i from public.ec_invoices e join private.ec_payment_attempts t on t.invoice_id=e.id where t.id=attempt;
 select * into a from public.ec_accounts where owner_id=i.owner_id for update;
 select * into p from private.ec_payment_attempts where id=attempt for update;
 select * into i from public.ec_invoices where id=p.invoice_id for update;
 if not found then raise exception 'unknown_invoice'; end if;
 update private.ec_payment_attempts set raw_provider_status=left(provider_status,80),payment_errors=coalesce(errors,'[]'),verified_at=now() where id=p.id;
 if p.status='paid' then
  if lower(provider_status) in ('canceled','cancelled') then update private.ec_payment_attempts set status='review' where id=p.id; update public.ec_invoices set status='review',review_reason='provider_canceled_after_payment' where id=i.id; return 'review'; end if;
  return 'paid';
 end if;
 if p.status='review' then return 'review'; end if;
 if p.order_no is distinct from order_no or amount is distinct from p.amount_halalas or currency_code is distinct from 'SAR' or transaction is null or (p.transaction_no is not null and p.transaction_no<>transaction) then
  update private.ec_payment_attempts set status='review' where id=p.id; update public.ec_invoices set status='review',review_reason='provider_mismatch' where id=i.id; return 'review';
 end if;
 update private.ec_payment_attempts set transaction_no=transaction where id=p.id;
 if lower(provider_status) in ('canceled','cancelled') then
  update private.ec_payment_attempts set status='cancelled' where id=p.id;
  update public.ec_accounts set billing_payment_failed=true where owner_id=a.owner_id; perform private.ec_billing_refresh(a.owner_id); return 'canceled';
 end if;
 if lower(provider_status)<>'paid' then
  update private.ec_payment_attempts set status=case when lower(provider_status) in ('failed','declined') or jsonb_array_length(coalesce(errors,'[]'))>0 then 'failed' else 'pending' end where id=p.id;
  update public.ec_accounts set billing_payment_failed=lower(provider_status) in ('failed','declined') or jsonb_array_length(coalesce(errors,'[]'))>0 where owner_id=a.owner_id;
  perform private.ec_billing_refresh(a.owner_id); return case when lower(provider_status) in ('failed','declined') or jsonb_array_length(coalesce(errors,'[]'))>0 then 'failed' else 'pending' end;
 end if;
 paid:=coalesce(provider_paid_at,now());
 -- Missing provider timestamps use verification time; neither browser time nor webhook time is accepted.
 if paid>now()+interval '5 minutes' or paid<p.created_at-interval '5 minutes' or p.status='cancelled' or i.status in ('paid','review') or a.cancelled_at is not null or coalesce(a.period_end,a.trial_end) is distinct from i.due_at then
  update private.ec_payment_attempts set status='review' where id=p.id; update public.ec_invoices set status='review',review_reason='period_or_payment_date_conflict' where id=i.id; return 'review';
 end if;
 select quote into q from private.ec_paylink_checkouts where invoice_id=i.id;
 update private.ec_payment_attempts set status='paid',paid_at=paid where id=p.id;
 update public.ec_invoices set status='paid',transaction_ref=transaction,paid_at=paid,cycle_start=paid,cycle_end=paid+interval '30 days' where id=i.id;
 update public.ec_accounts set status='active',subscription_state='ACTIVE',billing_plan=i.plan,period_start=paid,period_end=paid+interval '30 days',
 billing_payment_failed=false,billing_block=null,cancel_at_period_end=false,recurring_ref=null,payment_method_ref=null,
 locked_price_halalas=(q->>'net_halalas')::int,locked_total_halalas=i.amount_halalas,locked_tax_mode=q->>'tax_mode',locked_tax_bps=(q->>'tax_bps')::int,
 discount_qualified=(q->>'discount')::boolean,selected_clients=null,selected_templates=null where owner_id=a.owner_id;
 perform private.ec_billing_refresh(a.owner_id);
 return 'paid';
end $$;
create function public.ec_billing_refresh(owner uuid,blocked text default null) returns boolean language plpgsql security definer set search_path='' as $$ begin
 if blocked is not null and blocked not in ('PROVIDER_NOT_READY','TAX_NOT_CONFIGURED') then raise exception 'invalid_block'; end if;
 update public.ec_accounts set billing_block=blocked::public.ec_subscription_state,billing_checked_at=now(),
 subscription_state=case when not lifecycle_enabled and trial_used_at is null then coalesce(blocked::public.ec_subscription_state,'NOT_STARTED') else subscription_state end where owner_id=owner;
 perform private.ec_billing_refresh(owner); return true;
end $$;
create function public.ec_billing_cancel() returns boolean language plpgsql security definer set search_path='' as $$ begin
 update public.ec_accounts set cancelled_at=coalesce(cancelled_at,now()),subscription_state=case when coalesce(period_end,trial_end)>now() then 'CANCELLED'::public.ec_subscription_state else 'SUSPENDED'::public.ec_subscription_state end,
 cancel_at_period_end=true,lifecycle_enabled=true where owner_id=private.session_uid() and mode='managed';
 if not found then raise exception 'owner_required'; end if; return true;
end $$;
create function public.ec_billing_jobs() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(j),'[]') from (select a.owner_id,a.billing_plan,u.email from public.ec_accounts a join auth.users u on u.id=a.owner_id
 where a.lifecycle_enabled and a.cancelled_at is null and (coalesce(a.period_end,a.trial_end)<=now()+case when a.period_end is not null then interval '5 days' else interval '0' end)
 order by a.billing_checked_at nulls first,a.owner_id limit 100) j
$$;
alter function public.ec_reconcile() rename to ec_reconcile_before_lifecycle;
create function public.ec_reconcile() returns jsonb language plpgsql security definer set search_path='' as $$
declare old jsonb; begin
 old:=public.ec_reconcile_before_lifecycle();
 update public.ec_accounts a set subscription_state=private.ec_billing_value(a) where lifecycle_enabled;
 insert into public.ec_billing_notifications(owner_id,kind,notification_date,body)
 select owner_id,'trial_ending',(now() at time zone 'Asia/Riyadh')::date,'باقي 3 أيام أو أقل على نهاية تجربتك. جهّز دفع اشتراكك للاحتفاظ بالمزايا.' from public.ec_accounts
 where lifecycle_enabled and cancelled_at is null and period_end is null and trial_end>now() and trial_end<=now()+interval '3 days' on conflict do nothing;
 return old||jsonb_build_object('lifecycle_reconciled',true);
end $$;
create function public.ec_billing_overview() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('notifications',coalesce((select jsonb_agg(n) from (select id,body,created_at from public.ec_billing_notifications where owner_id=private.session_uid() order by created_at desc limit 7)n),'[]'),
 'invoices',coalesce((select jsonb_agg(t) from (select i.id,i.amount_halalas,i.status,i.paid_at,i.due_at,p.payment_url,p.transaction_no,p.order_no,p.raw_provider_status,p.status as attempt_status
 from public.ec_invoices i left join lateral(select * from private.ec_payment_attempts where invoice_id=i.id order by created_at desc,id desc limit 1)p on true
 where i.owner_id=private.session_uid() and i.due_at is not null order by i.created_at desc limit 20)t),'[]'))
$$;
create function public.ec_billing_provider_issue() returns boolean language plpgsql security definer set search_path='' as $$ begin
 update public.ec_config set provider_verified=false;
 return true;
end $$;
create function public.ec_billing_contact(owner uuid,mobile text,customer_name text) returns boolean language plpgsql security definer set search_path='' as $$ begin
 if mobile is null or mobile !~ '^05[0-9]{8}$' then raise exception 'mobile_required'; end if;
 update public.ec_accounts set billing_mobile=mobile,billing_name=left(customer_name,120) where owner_id=owner and mode='managed';
 if not found then raise exception 'owner_required'; end if;
 return true;
end $$;

revoke all on function public.ec_billing_start(uuid,text,text,text,text),public.ec_billing_prepare(uuid,text,integer),public.ec_billing_attach(uuid,text,text),public.ec_billing_lookup(text,text),public.ec_billing_settle(uuid,text,text,integer,text,text,timestamptz,jsonb),public.ec_billing_refresh(uuid,text),public.ec_billing_jobs(),public.ec_reconcile() from public,anon,authenticated;
revoke all on function public.ec_billing_config(),public.ec_billing_cancel(),public.ec_billing_overview(),public.ec_subscription() from public,anon;
grant execute on function public.ec_billing_config(),public.ec_billing_cancel(),public.ec_billing_overview(),public.ec_subscription() to authenticated;
revoke execute on function public.ec_start_trial_accepted(text,text),public.ec_paylink_reserve(text,integer,text) from authenticated;
revoke all on function public.ec_billing_provider_issue(),public.ec_billing_contact(uuid,text,text) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.ec_billing_config(),public.ec_billing_provider_issue(),public.ec_billing_contact(uuid,text,text) to service_role;
 grant execute on function public.ec_billing_start(uuid,text,text,text,text),public.ec_billing_prepare(uuid,text,integer),public.ec_billing_attach(uuid,text,text),public.ec_billing_lookup(text,text),public.ec_billing_settle(uuid,text,text,integer,text,text,timestamptz,jsonb),public.ec_billing_refresh(uuid,text),public.ec_billing_jobs(),public.ec_reconcile() to service_role;
 revoke execute on function public.ec_confirm_setup(uuid,text,text),public.ec_paylink_reserve(text,integer,text) from service_role;
end if; end $$;
-- No browser can invoke private helpers directly, including the trial gates.
revoke all on function private.ec_billing_value(public.ec_accounts),private.ec_billing_refresh(uuid),private.ec_billing_quote(uuid,text) from public,anon,authenticated;
