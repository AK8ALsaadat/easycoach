-- Reverts 20261116100000_platform_free_trial. Refuses while any card-less
-- trial is in progress, because the restored constraint would reject those rows.
do $$ begin
 if exists(select 1 from public.ec_accounts where status='trialing' and recurring_ref is null and trial_end>now()) then
  raise exception 'Card-less trials are still running; wait for them to end or export and settle them first';
 end if;
end $$;
drop function if exists public.ec_start_trial(text);
update public.ec_config set trial_enabled=false,trial_start=null,trial_end=null;
-- Expired card-less trials keep their history (trial_used_at) but must satisfy the old constraint.
update public.ec_accounts set status='expired' where status='trialing' and recurring_ref is null;
alter table public.ec_accounts drop constraint if exists ec_accounts_paid_plan_check, drop constraint if exists ec_accounts_active_total_check;
alter table public.ec_accounts add constraint ec_accounts_check1 check(status not in ('trialing','active') or (billing_plan<>'free' and locked_total_halalas is not null));
create or replace function public.ec_quote(plan_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.ec_plans; c public.ec_config; a public.ec_accounts; discount boolean; net integer; vat integer; total integer; begin
 select * into p from public.ec_plans where code=plan_code; if not found then raise exception 'باقة غير صالحة'; end if;
 select * into c from public.ec_config;
 select * into a from public.ec_accounts where owner_id=private.session_uid();
 discount:=p.code<>'free' and c.discount_enabled and c.reference_prices_approved and now()>=c.discount_start and now()<c.discount_end;
 net:=case when discount then ((p.price_halalas::bigint*80+50)/100)::int else p.price_halalas end;
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
create or replace function public.ec_subscription() returns jsonb language plpgsql stable security definer set search_path='' as $$
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
create or replace function public.ec_reconcile() returns jsonb language plpgsql security definer set search_path='' as $$
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
