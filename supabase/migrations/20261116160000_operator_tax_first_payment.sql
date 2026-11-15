-- Reuse the operator's existing singleton rather than a second source of truth.
-- No VAT registration number or provider approval is assumed by this migration.
alter table public.ec_config add column vat_number text,
 add column tax_configured boolean generated always as (
  tax_mode='not_registered' or (tax_mode in ('exclusive','inclusive') and coalesce(vat_number ~ '^[0-9]{15}$',false) and tax_bps is not null)
 ) stored;
alter table public.ec_accounts add column billing_first_due_at timestamptz;

-- Service-only setup. Environment VAT settings may synchronize tax, but never
-- silently restore provider approval after an authentication/permission failure.
create function public.ec_billing_operator_config(registration_number text,vat_basis_points integer,approve_provider boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$ begin
 if registration_number is null or registration_number !~ '^[0-9]{15}$' or vat_basis_points is null or vat_basis_points not between 0 and 10000 then raise exception 'invalid_tax_settings'; end if;
 update public.ec_config set vat_number=registration_number,tax_bps=vat_basis_points,tax_mode='exclusive',
 provider_verified=case when approve_provider then true else provider_verified end
 where vat_number is distinct from registration_number or tax_bps is distinct from vat_basis_points or tax_mode<>'exclusive' or (approve_provider and not provider_verified);
 return true;
end $$;
revoke all on function public.ec_billing_operator_config(text,integer,boolean) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.ec_billing_operator_config(text,integer,boolean) to service_role;
end if;end $$;
create or replace function public.ec_billing_config() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('verified',provider_verified,'tax_ready',tax_configured,'tax_mode',tax_mode) from public.ec_config
$$;

create or replace function private.ec_billing_quote(owner uuid,plan_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 if not c.tax_configured then c.tax_mode:='unconfigured'; end if;
 if c.tax_mode='not_registered' then vat:=0; total:=net;
 elsif c.tax_mode='exclusive' then vat:=round(net::numeric*c.tax_bps/10000)::int; total:=net+vat;
 elsif c.tax_mode='inclusive' then total:=net; vat:=net-round(net::numeric*10000/(10000+c.tax_bps))::int; end if;
 return jsonb_build_object('plan',p.code,'base_halalas',p.price_halalas,'net_halalas',net,'vat_halalas',vat,'total_halalas',total,'tax_mode',c.tax_mode,'tax_bps',c.tax_bps,'discount',discount,
 'campaign_active',discount,'limits',jsonb_build_object('clients',p.client_limit,'coaches',p.coach_limit,'templates',p.template_limit),
 'tax_configured',c.tax_configured,'vat_number',c.vat_number,'trial_available',a.billing_first_due_at is null and p.code<>'free' and c.trial_enabled and now()>=c.trial_start and now()<c.trial_end and a.mode='managed' and a.trial_used_at is null and a.period_end is null,
 'trial_campaign_active',c.trial_enabled and now()>=c.trial_start and now()<c.trial_end,'trial_campaign_end',c.trial_end,'trial_days',14,'trial_used',a.trial_used_at is not null,
 'provider_ready',c.provider_verified,'server_now',now());
end $$;

create or replace function private.ec_billing_value(a public.ec_accounts) returns public.ec_subscription_state
language plpgsql stable set search_path='' as $$
declare due timestamptz:=coalesce(a.period_end,a.trial_end,a.billing_first_due_at); pending boolean; base public.ec_subscription_state; begin
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

create or replace function public.ec_billing_start(owner uuid,plan_code text,mobile text,customer_name text,accepted_version text) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; q jsonb; begin
 select * into a from public.ec_accounts where owner_id=owner for update;
 if not found or a.mode<>'managed' or not exists(select 1 from auth.users where id=owner and email_confirmed_at is not null) then raise exception 'owner_required'; end if;
 if accepted_version is distinct from '2026-11-15.3' then raise exception 'terms_required'; end if;
 if mobile is null or mobile !~ '^05[0-9]{8}$' then raise exception 'mobile_required'; end if;
 if plan_code is null or plan_code not in ('starter','pro','business') then raise exception 'invalid_plan'; end if;
 if not (select provider_verified from public.ec_config) then raise exception 'provider_not_ready'; end if;
 q:=private.ec_billing_quote(owner,plan_code);
 if q->>'total_halalas' is null then raise exception 'tax_not_configured'; end if;
 if a.trial_used_at is not null or a.billing_first_due_at is not null or a.period_end is not null or a.cancelled_at is not null then raise exception 'trial_used'; end if;
 if not coalesce((q->>'trial_available')::boolean,false) then raise exception 'trial_unavailable'; end if;
 update public.ec_accounts set lifecycle_enabled=true,subscription_state='TRIAL_ACTIVE',status='trialing',billing_plan=plan_code,
 trial_used_at=now(),trial_start=now(),trial_end=now()+interval '336 hours',billing_mobile=mobile,billing_name=left(customer_name,120),
 locked_price_halalas=(q->>'net_halalas')::int,locked_total_halalas=(q->>'total_halalas')::int,locked_tax_mode=q->>'tax_mode',locked_tax_bps=(q->>'tax_bps')::int,
 discount_qualified=(q->>'discount')::boolean,cancel_at_period_end=false,recurring_ref=null,payment_method_ref=null,billing_block=null
 where owner_id=owner;
 insert into public.ec_trial_consents(owner_id,plan,policy_version,quote) values(owner,plan_code,accepted_version,q);
 return true;
end $$;

create or replace function public.ec_billing_prepare(owner uuid,plan_code text,expected_total integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; i public.ec_invoices; p private.ec_payment_attempts; q jsonb; due timestamptz; begin
 select * into a from public.ec_accounts where owner_id=owner for update;
 if not found or a.mode<>'managed' then raise exception 'owner_required'; end if;
 if a.billing_mobile is null or a.billing_mobile !~ '^05[0-9]{8}$' then raise exception 'mobile_required'; end if;
 if a.recurring_ref is not null then raise exception 'provider_not_ready'; end if;
 if a.cancelled_at is not null then raise exception 'subscription_cancelled'; end if;
 if not (select provider_verified from public.ec_config) then raise exception 'provider_not_ready'; end if;
 due:=coalesce(a.period_end,a.trial_end,a.billing_first_due_at);
 if due is null then
  due:=now();
  update public.ec_accounts set billing_first_due_at=due,lifecycle_enabled=true where owner_id=owner;
 end if;
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
  insert into private.ec_paylink_checkouts(invoice_id,quote,policy_version) values(i.id,q,'2026-11-15.3');
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

create or replace function public.ec_billing_settle(attempt uuid,transaction text,order_no text,amount integer,currency_code text,provider_status text,provider_paid_at timestamptz,errors jsonb) returns text
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
 if paid>now()+interval '5 minutes' or paid<p.created_at-interval '5 minutes' or p.status='cancelled' or i.status in ('paid','review') or a.cancelled_at is not null or coalesce(a.period_end,a.trial_end,a.billing_first_due_at) is distinct from i.due_at then
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

-- Operator not registered for VAT. The VAT_REGISTERED=false environment value may only move an
-- unconfigured singleton to not_registered. Explicit database tax settings always win.
create function public.ec_billing_operator_not_registered() returns text language plpgsql security definer set search_path='' as $$
declare mode text; begin
 update public.ec_config set tax_mode='not_registered',tax_bps=null,vat_number=null where tax_mode='unconfigured';
 select tax_mode into mode from public.ec_config;
 return mode;
end $$;
revoke all on function public.ec_billing_operator_not_registered() from public,anon,authenticated;

-- Payment state log: no secrets, no card data, no provider payloads. Service writes only.
create table private.payment_events (
 id bigint generated always as identity primary key,
 invoice_id uuid references public.ec_invoices(id) on delete set null,
 source text not null check(source in ('webhook','return','callback','cancel','checkout')),
 status text not null check(status in ('paid','pending','failed','canceled','review','unknown','verification_failed','unauthorized')),
 amount_halalas integer,
 provider_amount_halalas integer,
 request_id text check(char_length(request_id)<=128),
 occurrences integer not null default 1 check(occurrences>0),
 created_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now()
);
create index payment_events_recent on private.payment_events(created_at desc);
create index payment_events_invoice on private.payment_events(invoice_id,created_at) where invoice_id is not null;
revoke all on private.payment_events from public,anon,authenticated;

-- Invoice and expected amount are resolved from the stored attempt, never from the caller.
-- Unauthenticated webhook calls are counted in one row per hour so they cannot flood the table.
create function public.ec_billing_event_log(event_source text,event_status text,attempt uuid default null,provider_amount integer default null,request_ref text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare invoice uuid; expected integer; ref text:=left(nullif(regexp_replace(coalesce(request_ref,''),'[^A-Za-z0-9:._-]','','g'),''),128); begin
 if event_status='unauthorized' then
  update private.payment_events set occurrences=occurrences+1,last_seen_at=now(),request_id=coalesce(ref,request_id)
  where status='unauthorized' and source=event_source and invoice_id is null and created_at>=date_trunc('hour',now());
  if found then return true; end if;
 end if;
 if attempt is not null then select t.invoice_id,t.amount_halalas into invoice,expected from private.ec_payment_attempts t where t.id=attempt; end if;
 insert into private.payment_events(invoice_id,source,status,amount_halalas,provider_amount_halalas,request_id)
 values(invoice,event_source,event_status,expected,provider_amount,ref);
 return true;
end $$;
revoke all on function public.ec_billing_event_log(text,text,uuid,integer,text) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.ec_billing_operator_not_registered() to service_role;
 grant execute on function public.ec_billing_event_log(text,text,uuid,integer,text) to service_role;
end if;end $$;
