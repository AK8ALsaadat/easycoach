-- Preserve every promised trial day when the first paid period is prepaid.
create or replace function public.ec_billing_prepare(owner uuid,plan_code text,expected_total integer default null,coupon_code text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; i public.ec_invoices; p private.ec_payment_attempts; q jsonb; saved jsonb; due timestamptz; begin
 select * into a from public.ec_accounts where owner_id=owner for update;
 if not found or a.mode<>'managed' then raise exception 'owner_required'; end if;
 if a.billing_mobile is null or a.billing_mobile !~ '^05[0-9]{8}$' then raise exception 'mobile_required'; end if;
 if a.recurring_ref is not null then raise exception 'provider_not_ready'; end if;
 if a.cancelled_at is not null then raise exception 'subscription_cancelled'; end if;
 if not (select provider_verified from public.ec_config) then raise exception 'provider_not_ready'; end if;
 due:=coalesce(a.period_end,a.trial_end,a.billing_first_due_at);
 if due is null then due:=now(); update public.ec_accounts set billing_first_due_at=due,lifecycle_enabled=true where owner_id=owner; end if;
 if a.period_end>now()+interval '5 days' then raise exception 'period_running'; end if;
 q:=public.ec_billing_coupon_quote(owner,plan_code,coupon_code);
 if q->>'total_halalas' is null then raise exception 'tax_not_configured'; end if;
 if expected_total is not null and expected_total<>(q->>'total_halalas')::int then raise exception 'quote_changed'; end if;
 select * into i from public.ec_invoices where owner_id=owner and due_at=due for update;
 if found then
  select quote into saved from private.ec_paylink_checkouts where invoice_id=i.id;
  if i.plan<>plan_code or (saved->>'coupon_code') is distinct from (q->>'coupon_code') then raise exception 'pending_invoice'; end if;
  if expected_total is not null and expected_total<>i.amount_halalas then raise exception 'quote_changed'; end if;
  if i.status in ('paid','review') then raise exception 'payment_review'; end if;
 else
  insert into public.ec_invoices(owner_id,cycle_start,cycle_end,plan,amount_halalas,provider_order,due_at)
  values(owner,due,due+interval '30 days',plan_code,(q->>'total_halalas')::int,'ECP-'||replace(gen_random_uuid()::text,'-',''),due) returning * into i;
  insert into private.ec_paylink_checkouts(invoice_id,quote,policy_version) values(i.id,q,'2026-11-15.4');
 end if;
 select * into p from private.ec_payment_attempts where invoice_id=i.id order by created_at desc,id desc limit 1;
 if found and p.status<>'cancelled' then return to_jsonb(p)||jsonb_build_object('created',false,'plan',i.plan,'owner_id',owner,'customer_name',a.billing_name,'mobile',a.billing_mobile); end if;
 if (select count(*) from private.ec_payment_attempts where invoice_id=i.id and created_at>now()-interval '1 hour')>=10 then raise exception 'rate_limited'; end if;
 insert into private.ec_payment_attempts(invoice_id,amount_halalas) values(i.id,i.amount_halalas) returning * into p;
 update public.ec_invoices set status='pending' where id=i.id;
 update public.ec_accounts set billing_payment_failed=false,billing_block=null where owner_id=owner;
 perform private.ec_billing_refresh(owner);
 return to_jsonb(p)||jsonb_build_object('created',true,'plan',i.plan,'owner_id',owner,'customer_name',a.billing_name,'mobile',a.billing_mobile);
end $$;

create or replace function public.ec_billing_settle(attempt uuid,transaction text,order_no text,amount integer,currency_code text,provider_status text,provider_paid_at timestamptz,errors jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare p private.ec_payment_attempts; i public.ec_invoices; a public.ec_accounts; q jsonb; paid timestamptz; cycle_start_at timestamptz; begin
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
 -- First payment during a trial buys 30 full days after the promised trial end.
 cycle_start_at:=case when a.period_end is null then greatest(paid,a.trial_end) else paid end;
 select quote into q from private.ec_paylink_checkouts where invoice_id=i.id;
 update private.ec_payment_attempts set status='paid',paid_at=paid where id=p.id;
 update public.ec_invoices set status='paid',transaction_ref=transaction,paid_at=paid,cycle_start=cycle_start_at,cycle_end=cycle_start_at+interval '30 days' where id=i.id;
 update public.ec_accounts set status='active',subscription_state='ACTIVE',billing_plan=i.plan,period_start=cycle_start_at,period_end=cycle_start_at+interval '30 days',
 billing_payment_failed=false,billing_block=null,cancel_at_period_end=false,recurring_ref=null,payment_method_ref=null,
 locked_price_halalas=coalesce((q->>'regular_net_halalas')::int,(q->>'net_halalas')::int),locked_total_halalas=coalesce((q->>'regular_total_halalas')::int,i.amount_halalas),locked_tax_mode=q->>'tax_mode',locked_tax_bps=(q->>'tax_bps')::int,
 discount_qualified=(q->>'discount')::boolean,selected_clients=null,selected_templates=null where owner_id=a.owner_id;
 perform private.ec_billing_refresh(a.owner_id);
 return 'paid';
end $$;


create or replace function private.ec_billing_value(a public.ec_accounts) returns public.ec_subscription_state
language plpgsql stable set search_path='' as $$
declare due timestamptz:=coalesce(a.period_end,a.trial_end,a.billing_first_due_at); pending boolean; base public.ec_subscription_state; begin
 if a.cancelled_at is not null then return case when coalesce(a.period_end,a.trial_end)>now() then 'CANCELLED' else 'SUSPENDED' end; end if;
 select exists(select 1 from public.ec_invoices i where i.owner_id=a.owner_id and i.due_at=due and i.status in ('pending','failed','review')) into pending;
 if a.period_start>now() and a.trial_end>now() then base:=case when a.trial_end<=now()+interval '3 days' then 'TRIAL_ENDING' else 'TRIAL_ACTIVE' end;
 elsif a.period_end>now() then base:=case when pending then 'AWAITING_PAYMENT' else 'ACTIVE' end;
 elsif a.trial_end>now() then base:=case when a.trial_end<=now()+interval '3 days' then 'TRIAL_ENDING' else 'TRIAL_ACTIVE' end;
 elsif due is not null then
  if now()>=due+interval '3 days' then return 'SUSPENDED'; end if;
  base:=case when a.period_end is not null then 'PAST_DUE' else 'AWAITING_PAYMENT' end;
 else base:='NOT_STARTED'; end if;
 if a.billing_block is not null then return a.billing_block; end if;
 if a.billing_payment_failed and base in ('AWAITING_PAYMENT','PAST_DUE') then return 'PAYMENT_FAILED'; end if;
 return base;
end $$;


create or replace function private.ec_plan(owner uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare a public.ec_accounts; begin
 select * into a from public.ec_accounts where owner_id=owner;
 if not found then return 'free'; end if;
 if a.mode='legacy' then return 'business'; end if;
 -- Prepayment must not downgrade the Business trial before its promised end.
 if a.trial_end>now() and a.period_start>=a.trial_end then return 'business'; end if;
 if not a.lifecycle_enabled then
  return case when a.status='trialing' and a.trial_end>now() then 'business' when a.status='active' and a.period_end>now() then a.billing_plan else 'free' end;
 end if;
 if a.cancelled_at is not null then
  return case when a.period_end>now() then a.billing_plan when a.period_end is null and a.trial_end>now() then 'business' else 'free' end;
 end if;
 if a.period_end is not null then return case when a.period_end+interval '3 days'>now() then a.billing_plan else 'free' end; end if;
 return case when a.trial_end+interval '3 days'>now() then 'business' else 'free' end;
end $$;


create or replace function public.ec_subscription() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.ec_accounts; j jsonb; begin
 j:=public.ec_subscription_before_lifecycle(); select * into a from public.ec_accounts where owner_id=private.session_uid();
 return j||jsonb_build_object('subscription_state',case when a.lifecycle_enabled then private.ec_billing_value(a) else a.subscription_state end,
 'status',case when a.period_start>now() and a.trial_end>now() then 'trialing' else j->>'status' end,
 'period_start',a.period_start,'lifecycle_enabled',a.lifecycle_enabled,'paid_until',a.period_end,'grace_ends_at',case when a.cancelled_at is null then coalesce(a.period_end,a.trial_end)+interval '3 days' else coalesce(a.period_end,a.trial_end) end,
 'cancelled_at',a.cancelled_at,'billing_mobile',a.billing_mobile,'has_payment_method',false);
end $$;


-- Record acceptance of the updated prepaid-trial payment notices.
create or replace function public.ec_billing_start(owner uuid,plan_code text,mobile text,customer_name text,accepted_version text) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; q jsonb; begin
 select * into a from public.ec_accounts where owner_id=owner for update;
 if not found or a.mode<>'managed' or not exists(select 1 from auth.users where id=owner and email_confirmed_at is not null) then raise exception 'owner_required'; end if;
 if accepted_version is distinct from '2026-11-15.4' then raise exception 'terms_required'; end if;
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

