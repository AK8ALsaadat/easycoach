-- Card-less 14-day free trial for every paid EasyCoach plan, for a limited
-- campaign window. The owner starts it from the app after verifying their
-- email; no payment method, invoice or provider call is involved. When the
-- trial ends without a verified payment the account returns to Free (status
-- 'expired', not 'past_due', because nothing was ever due).
--
-- Trusted provider flows (ec_confirm_setup, ec_record_payment) are unchanged.

-- 1. A trial without a payment method has no locked total yet: the total is
--    only known once tax settings are configured. 'active' still requires it.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.ec_accounts'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%locked_total_halalas%' loop
  execute format('alter table public.ec_accounts drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.ec_accounts
 add constraint ec_accounts_paid_plan_check check(status not in ('trialing','active') or billing_plan<>'free'),
 add constraint ec_accounts_active_total_check check(status<>'active' or locked_total_halalas is not null);

-- 2. The free-trial campaign window. Change the end date to extend or close
--    the offer; the application reads it from ec_quote and never invents one.
update public.ec_config set trial_enabled=true,
 trial_start=coalesce(trial_start,now()),
 trial_end=greatest(coalesce(trial_end,'2026-12-31 20:59:59+00'::timestamptz),'2026-12-31 20:59:59+00'::timestamptz);

-- 3. Quote exposes the campaign so the UI can state the real end date.
create or replace function public.ec_quote(plan_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.ec_plans; c public.ec_config; a public.ec_accounts; discount boolean; net integer; vat integer; total integer; trial_open boolean; begin
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
 trial_open:=c.trial_enabled and now()>=c.trial_start and now()<c.trial_end;
 return jsonb_build_object('plan',p.code,'base_halalas',p.price_halalas,'net_halalas',net,'vat_halalas',vat,'total_halalas',total,
 'limits',jsonb_build_object('clients',p.client_limit,'coaches',p.coach_limit,'templates',p.template_limit),
 'tax_mode',c.tax_mode,'discount',discount,'campaign_active',c.discount_enabled and now()>=c.discount_start and now()<c.discount_end,
 'trial_available',p.code<>'free' and trial_open and a.trial_used_at is null and coalesce(a.mode,'managed')='managed' and coalesce(a.status,'free') in ('free','expired'),
 'trial_campaign_active',trial_open,'trial_campaign_end',case when trial_open then c.trial_end end,'trial_days',14,
 'trial_used',a.trial_used_at is not null,
 'provider_ready',false,'server_now',now());
end $$;

-- 4. The owner starts their own trial. Idempotency: one trial per account, ever.
create function public.ec_start_trial(plan_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; cfg public.ec_config; q jsonb; begin
 select * into a from public.ec_accounts where owner_id=private.session_uid() for update;
 if not found then raise exception 'التجربة المجانية لمالك حساب مدرب' using errcode='P0403'; end if;
 if a.mode='legacy' then raise exception 'حسابك سابق ويملك كل المزايا بالفعل'; end if;
 if plan_code not in ('starter','pro','business') then raise exception 'اختر باقة مدفوعة لبدء التجربة'; end if;
 select * into cfg from public.ec_config;
 if not cfg.trial_enabled or now()<cfg.trial_start or now()>=cfg.trial_end then raise exception 'انتهت فترة عرض التجربة المجانية'; end if;
 if a.trial_used_at is not null then raise exception 'استخدمت التجربة المجانية من قبل؛ يمكنك الاشتراك مباشرة'; end if;
 if a.status not in ('free','expired') or a.recurring_ref is not null then raise exception 'لديك اشتراك قائم بالفعل'; end if;
 q:=public.ec_quote(plan_code);
 update public.ec_accounts set mode='managed',billing_plan=plan_code,status='trialing',
  trial_used_at=now(),trial_start=now(),trial_end=now()+interval '336 hours',
  period_start=null,period_end=null,cancel_at_period_end=false,
  locked_price_halalas=(q->>'net_halalas')::int,locked_total_halalas=(q->>'total_halalas')::int,
  locked_tax_mode=q->>'tax_mode',locked_tax_bps=cfg.tax_bps,discount_qualified=(q->>'discount')::boolean,
  selected_clients=null,selected_templates=null
  where owner_id=a.owner_id;
 return public.ec_subscription();
end $$;

-- 5. A trial that ends without a payment method simply expires.
create or replace function public.ec_subscription() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.ec_accounts; p public.ec_plans; clients integer; templates integer; begin
 select * into a from public.ec_accounts where owner_id=private.session_uid();
 if not found then raise exception 'هذه الصفحة لمالك حساب مدرب' using errcode='P0403'; end if;
 select * into p from public.ec_plans where code=private.ec_plan(a.owner_id);
 select count(*) into clients from public.clients where coach_id=a.owner_id and not archived;
 select count(*) into templates from public.templates t where coach_id=a.owner_id and not exists(select 1 from public.template_metadata m where m.template_id=t.id and m.archived);
 return jsonb_build_object('mode',a.mode,'status',case when a.status='trialing' and a.trial_end<=now() then case when a.cancel_at_period_end or a.recurring_ref is null then 'expired' else 'past_due' end when a.status='active' and a.period_end<=now() then case when a.cancel_at_period_end then 'expired' else 'past_due' end else a.status end,
 'billing_plan',a.billing_plan,'effective_plan',p.code,'cancel_at_period_end',a.cancel_at_period_end,'trial_end',a.trial_end,'trial_used_at',a.trial_used_at,
 'period_end',a.period_end,'locked_price_halalas',a.locked_price_halalas,'total_halalas',a.locked_total_halalas,'currency','SAR',
 'has_payment_method',a.recurring_ref is not null,
 'usage',jsonb_build_object('clients',clients,'templates',templates,'coaches',(select count(*)+1 from public.ec_team where owner_id=a.owner_id and active)),
 'limits',jsonb_build_object('clients',p.client_limit,'templates',p.template_limit,'coaches',p.coach_limit),
 'billing_limits',(select jsonb_build_object('clients',client_limit,'coaches',coach_limit,'templates',template_limit) from public.ec_plans where code=a.billing_plan),
 'locked_clients',a.selected_clients,'locked_templates',a.selected_templates,'features',p.features,'server_now',now());
end $$;
create or replace function public.ec_reconcile() returns jsonb language plpgsql security definer set search_path='' as $$
declare count_expired integer; begin
 insert into public.ec_email_outbox(owner_id,kind,period_ref,payload)
 select owner_id,case when trial_end-now()>interval '1 day' then 'trial_3_days' else 'trial_1_day' end,trial_end,
 jsonb_build_object('billing_plan',billing_plan,'total_halalas',locked_total_halalas,'trial_end',trial_end,'cancel_at_period_end',cancel_at_period_end,'has_payment_method',recurring_ref is not null)
 from public.ec_accounts where mode='managed' and status='trialing' and trial_end>now() and trial_end<=now()+interval '3 days'
 on conflict(owner_id,kind,period_ref) do nothing;
 update public.ec_accounts set status=case when cancel_at_period_end or (status='trialing' and recurring_ref is null) then 'expired' else 'past_due' end,
 discount_qualified=case when cancel_at_period_end then false else discount_qualified end
 where mode='managed' and ((status='trialing' and trial_end<=now()) or (status='active' and period_end<=now()));
 get diagnostics count_expired=row_count;
 return jsonb_build_object('expired',count_expired,'server_now',now());
end $$;

revoke all on function public.ec_start_trial(text) from public,anon,authenticated,coach_api;
grant execute on function public.ec_start_trial(text) to authenticated;
