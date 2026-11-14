-- Paylink belongs to EasyCoach, never to individual coaches. Retain historical
-- trainee ledgers, but retire all service entry points that could charge them.

create table private.ec_paylink_checkouts (
 invoice_id uuid primary key references public.ec_invoices(id),
 quote jsonb not null, policy_version text not null, accepted_at timestamptz not null default now(),
 payment_url text, created_at timestamptz not null default now()
);
revoke all on private.ec_paylink_checkouts from public,anon,authenticated;

create function public.ec_paylink_reserve(plan_code text, expected_total integer, accepted_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; q jsonb; i public.ec_invoices; c private.ec_paylink_checkouts; begin
 select * into a from public.ec_accounts where owner_id=private.session_uid() for update;
 if not found or a.mode<>'managed' or not exists(select 1 from auth.users where id=a.owner_id and email_confirmed_at is not null) then raise exception 'owner_required' using errcode='P0403'; end if;
 if plan_code not in ('starter','pro','business') then raise exception 'invalid_plan'; end if;
 if accepted_version is distinct from '2026-11-15' then raise exception 'terms_required'; end if;
 if (a.status='trialing' and a.trial_end>now()) or (a.status='active' and a.period_end>now()) or a.recurring_ref is not null then
  raise exception 'period_running';
 end if;
 if not (select provider_verified from public.ec_config) then raise exception 'billing_unavailable'; end if;
 q:=public.ec_quote(plan_code)||jsonb_build_object('tax_bps',(select tax_bps from public.ec_config));
 if (q->>'total_halalas')::int is null or (q->>'total_halalas')::int<500 then raise exception 'tax_unconfigured'; end if;
 if expected_total is distinct from (q->>'total_halalas')::int then raise exception 'quote_changed'; end if;
 select e.* into i from public.ec_invoices e join private.ec_paylink_checkouts p on p.invoice_id=e.id
 where e.owner_id=a.owner_id and e.status in ('pending','review') order by e.created_at desc limit 1;
 if found then
  if i.status='review' then raise exception 'payment_review'; end if;
  if i.plan<>plan_code or i.amount_halalas<>expected_total then raise exception 'pending_invoice'; end if;
  select * into c from private.ec_paylink_checkouts where invoice_id=i.id;
  return to_jsonb(i)||jsonb_build_object('created',false,'payment_url',c.payment_url);
 end if;
 if (select count(*) from public.ec_invoices where owner_id=a.owner_id and created_at>now()-interval '1 hour')>=10 then raise exception 'rate_limited'; end if;
 insert into public.ec_invoices(owner_id,cycle_start,cycle_end,plan,amount_halalas,provider_order)
 values(a.owner_id,now(),now()+interval '1 month',plan_code,expected_total,'ECP-'||replace(gen_random_uuid()::text,'-','')) returning * into i;
 insert into private.ec_paylink_checkouts(invoice_id,quote,policy_version) values(i.id,q,accepted_version);
 return to_jsonb(i)||jsonb_build_object('created',true,'payment_url',null);
end $$;

create function public.ec_paylink_attach(invoice uuid, transaction text, url text) returns boolean
language plpgsql security definer set search_path='' as $$ begin
 if transaction is null or length(transaction)>64 or url is null then raise exception 'invalid_invoice'; end if;
 update public.ec_invoices e set transaction_ref=transaction where e.id=invoice and e.status='pending'
 and (e.transaction_ref is null or e.transaction_ref=transaction) and exists(select 1 from private.ec_paylink_checkouts c where c.invoice_id=e.id);
 if not found then raise exception 'invoice_conflict'; end if;
 update private.ec_paylink_checkouts set payment_url=url where invoice_id=invoice;
 return true;
end $$;

create function public.ec_paylink_lookup(transaction text, order_no text) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(e) from public.ec_invoices e join private.ec_paylink_checkouts c on c.invoice_id=e.id
 where (transaction is not null and e.transaction_ref=transaction) or (order_no is not null and e.provider_order=order_no) limit 1
$$;

-- Only the trusted server calls this after getInvoice on the platform merchant.
-- The browser and webhook body can never supply authoritative payment state.
create function public.ec_paylink_settle(invoice uuid, transaction text, order_no text, amount integer, currency_code text, provider_status text)
returns text language plpgsql security definer set search_path='' as $$
declare a public.ec_accounts; i public.ec_invoices; q jsonb; begin
 select owner_id into a.owner_id from public.ec_invoices where id=invoice;
 select acc.* into a from public.ec_accounts acc where acc.owner_id=a.owner_id for update;
 select e.* into i from public.ec_invoices e join private.ec_paylink_checkouts c on c.invoice_id=e.id where e.id=invoice for update of e;
 if not found then raise exception 'invoice_unknown'; end if;
 if i.status='paid' then
  if provider_status='Canceled' then
   update public.ec_invoices set status='review',review_reason='provider_canceled_after_payment' where id=i.id;
   return 'review';
  end if;
  return 'paid';
 end if;
 if i.status='review' then return 'review'; end if;
 if transaction is null or i.provider_order is distinct from order_no or (i.transaction_ref is not null and i.transaction_ref<>transaction)
 or i.amount_halalas is distinct from amount or currency_code is distinct from 'SAR' then
  update public.ec_invoices set status='review',review_reason='provider_mismatch' where id=i.id; return 'review';
 end if;
 update public.ec_invoices set transaction_ref=transaction where id=i.id;
 if provider_status='Canceled' then update public.ec_invoices set status='failed' where id=i.id; return 'canceled'; end if;
 if provider_status<>'Paid' then return 'pending'; end if;
 if i.status<>'pending' or a.mode<>'managed' or a.recurring_ref is not null
 or (a.status='trialing' and a.trial_end>now()) or (a.status='active' and a.period_end>now()) then
  update public.ec_invoices set status='review',review_reason='account_period_conflict' where id=i.id; return 'review';
 end if;
 select quote into q from private.ec_paylink_checkouts where invoice_id=i.id;
 update public.ec_invoices set status='paid',paid_at=now(),cycle_start=now(),cycle_end=now()+interval '1 month' where id=i.id;
 update public.ec_accounts set billing_plan=i.plan,status='active',period_start=now(),period_end=now()+interval '1 month',
  cancel_at_period_end=true,provider_canceled_at=null,recurring_ref=null,payment_method_ref=null,
  locked_price_halalas=(q->>'net_halalas')::int,locked_total_halalas=i.amount_halalas,
  locked_tax_mode=q->>'tax_mode',locked_tax_bps=(q->>'tax_bps')::int,discount_qualified=(q->>'discount')::boolean,
  selected_clients=null,selected_templates=null where owner_id=i.owner_id;
 return 'paid';
end $$;

revoke all on function public.ec_paylink_reserve(text,integer,text),public.ec_paylink_attach(uuid,text,text),public.ec_paylink_lookup(text,text),public.ec_paylink_settle(uuid,text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.ec_paylink_reserve(text,integer,text) to authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.ec_paylink_attach(uuid,text,text),public.ec_paylink_lookup(text,text),public.ec_paylink_settle(uuid,text,text,integer,text,text) to service_role;
end if; end $$;

-- Retire all old coach merchant and trainee collection RPCs. Records remain intact.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'paylink_%' loop
  execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
  if exists(select 1 from pg_roles where rolname='service_role') then
   execute format('revoke execute on function %s from service_role',f.signature);
  end if;
 end loop;
end $$;

-- Trial consent keeps its immutable evidence while new starts accept current terms.
create or replace function public.ec_start_trial_accepted(plan_code text,accepted_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb; result jsonb; begin
 if accepted_version is distinct from '2026-11-15' then raise exception 'وافق على الشروط وسياسة الخصوصية الحالية'; end if;
 if plan_code is null or plan_code not in ('starter','pro','business') then raise exception 'اختر باقة مدفوعة لبدء التجربة'; end if;
 perform 1 from public.ec_accounts where owner_id=private.session_uid() for update;
 q:=public.ec_quote(plan_code);
 result:=public.ec_start_trial(plan_code);
 insert into public.ec_trial_consents(owner_id,plan,policy_version,quote) values(private.session_uid(),plan_code,accepted_version,q);
 return result;
end $$;

create function public.ec_paylink_ready() returns boolean language sql stable security definer set search_path='' as $$
 select provider_verified and tax_mode<>'unconfigured' from public.ec_config
$$;
revoke all on function public.ec_paylink_ready() from public,anon;
grant execute on function public.ec_paylink_ready() to authenticated;
