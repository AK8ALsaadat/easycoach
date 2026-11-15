-- Free trials never depend on merchant approval, tax configuration, or a phone.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.ec_accounts'::regclass and contype='c' and pg_get_constraintdef(oid) like '%locked_total_halalas IS NOT NULL%' loop
  execute format('alter table public.ec_accounts drop constraint %I',c.conname);
 end loop; end $$;
alter table public.ec_accounts add constraint ec_accounts_active_quote_required check(status<>'active' or (billing_plan<>'free' and locked_total_halalas is not null)), add constraint ec_accounts_trial_paid_plan check(status<>'trialing' or billing_plan<>'free');

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
  net:=a.locked_price_halalas; discount:=a.discount_qualified; if a.locked_tax_mode in ('not_registered','exclusive','inclusive') and a.locked_total_halalas is not null then c.tax_mode:=a.locked_tax_mode; c.tax_bps:=a.locked_tax_bps; end if;
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


create or replace function public.ec_billing_start(owner uuid,plan_code text,mobile text,customer_name text,accepted_version text) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; q jsonb; begin
 select * into a from public.ec_accounts where owner_id=owner for update;
 if not found or a.mode<>'managed' or not exists(select 1 from auth.users where id=owner and email_confirmed_at is not null) then raise exception 'owner_required'; end if;
 if accepted_version is null or accepted_version not in ('2026-11-15.5','2026-11-15.6') then raise exception 'terms_required'; end if;
 if nullif(btrim(mobile),'') is not null and mobile !~ '^05[0-9]{8}$' then raise exception 'mobile_required'; end if;
 if plan_code is null or plan_code not in ('starter','pro','business') then raise exception 'invalid_plan'; end if;
 if a.trial_used_at is not null or a.billing_first_due_at is not null or a.period_end is not null or a.cancelled_at is not null then raise exception 'trial_used'; end if;
 q:=private.ec_billing_quote(owner,plan_code);
 if not coalesce((q->>'trial_available')::boolean,false) then raise exception 'trial_unavailable'; end if;
 update public.ec_accounts set lifecycle_enabled=true,subscription_state='TRIAL_ACTIVE',status='trialing',billing_plan=plan_code,
 trial_used_at=now(),trial_start=now(),trial_end=now()+interval '336 hours',billing_mobile=nullif(btrim(mobile),''),billing_name=left(customer_name,120),
 locked_price_halalas=(q->>'net_halalas')::int,locked_total_halalas=(q->>'total_halalas')::int,locked_tax_mode=q->>'tax_mode',locked_tax_bps=(q->>'tax_bps')::int,
 discount_qualified=(q->>'discount')::boolean,cancel_at_period_end=false,recurring_ref=null,payment_method_ref=null,billing_block=null
 where owner_id=owner;
 insert into public.ec_trial_consents(owner_id,plan,policy_version,quote) values(owner,plan_code,accepted_version,q);
 return true; end $$;

create or replace function public.ec_billing_prepare(owner uuid,plan_code text,expected_total integer default null,coupon_code text default null,transition_legacy boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; i public.ec_invoices; p private.ec_payment_attempts; q jsonb; saved jsonb; due timestamptz; begin
 select * into a from public.ec_accounts where owner_id=owner for update;
 if not found or a.mode not in ('managed','legacy') then raise exception 'owner_required'; end if;
 if a.mode='legacy' and not coalesce(transition_legacy,false) then raise exception 'legacy_consent_required'; end if;
 if a.billing_mobile is null or a.billing_mobile !~ '^05[0-9]{8}$' then raise exception 'mobile_required'; end if;
 if a.recurring_ref is not null then raise exception 'provider_not_ready'; end if;
 if a.cancelled_at is not null then raise exception 'subscription_cancelled'; end if;
 if not (select provider_verified from public.ec_config) then raise exception 'provider_not_ready'; end if;
 due:=coalesce(a.period_end,a.trial_end,a.billing_first_due_at);
 if due is null then due:=now(); update public.ec_accounts set billing_first_due_at=due,lifecycle_enabled=true where owner_id=owner; end if;
 if a.period_end>now()+interval '5 days' then raise exception 'period_running'; end if;
 q:=public.ec_billing_coupon_quote(owner,plan_code,coupon_code);
 if a.mode='legacy' then q:=q||jsonb_build_object('legacy_transition',true); end if;
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
  insert into private.ec_paylink_checkouts(invoice_id,quote,policy_version) values(i.id,q,'2026-11-15.6');
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


