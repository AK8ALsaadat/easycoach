-- Online subscription payments through each coach's own Paylink account.
-- Money goes straight to the coach's merchant account; EasyCoach never holds funds.
-- Every function here is server-only (service role). Paylink's getInvoice is the
-- only source of truth, so nothing in a callback URL or webhook body is trusted.

alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check check(method in ('bank','cash','other','paylink'));

-- API ID, secret key and webhook secret, sealed together with AES-256-GCM by the app.
create table private.paylink_accounts (
 coach_id uuid primary key references public.profiles(id) on delete cascade,
 sealed text not null check(length(sealed) between 40 and 4000),
 updated_at timestamptz not null default now()
);
alter table private.paylink_accounts enable row level security;
revoke all on private.paylink_accounts from public,anon,authenticated,coach_api;

create table public.paylink_invoices (
 id uuid primary key default gen_random_uuid(),
 coach_id uuid not null,
 subscription_id uuid not null,
 client_id uuid not null,
 order_number text not null unique check(order_number ~ '^EC-[A-Z0-9-]{8,60}$'),
 transaction_no text unique check(transaction_no ~ '^[A-Za-z0-9-]{1,64}$'),
 amount numeric(12,2) not null check(amount>=5 and amount<=1000000),
 status text not null default 'pending' check(status in ('pending','paid','canceled','failed','review')),
 -- The app allows only https://*.paylink.sa in production (loopback for a local mock in development).
 payment_url text check(payment_url is null or (payment_url ~ '^https?://' and length(payment_url)<=500)),
 payment_errors jsonb not null default '[]'::jsonb check(jsonb_typeof(payment_errors)='array'),
 payment_type text check(payment_type is null or length(payment_type)<=40),
 review_reason text check(review_reason is null or review_reason in ('amount_mismatch','exceeds_balance')),
 payment_id uuid unique,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours',
 settled_at timestamptz,
 foreign key(subscription_id,coach_id) references public.subscriptions(id,coach_id) on delete cascade,
 foreign key(client_id,coach_id) references public.clients(id,coach_id) on delete cascade
);
create index paylink_invoices_subscription on public.paylink_invoices(subscription_id,created_at desc);
create index paylink_invoices_coach on public.paylink_invoices(coach_id,created_at desc);
alter table public.paylink_invoices enable row level security;
revoke all on public.paylink_invoices from public,anon,authenticated,coach_api;
grant select on public.paylink_invoices to authenticated;
create policy paylink_invoice_coach on public.paylink_invoices for select to authenticated using(coach_id=auth.uid());
create policy paylink_invoice_trainee on public.paylink_invoices for select to authenticated
 using(exists(select 1 from public.clients c where c.id=client_id and c.trainee_user_id=auth.uid() and not c.archived));

create function public.paylink_account_get(coach uuid) returns text
language sql stable security definer set search_path='' as $$
 select sealed from private.paylink_accounts where coach_id=coach
$$;

-- sealed=null removes the connection.
create function public.paylink_account_put(coach uuid, sealed text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=coach and role='coach') then raise exception 'Coach not found'; end if;
 if sealed is null then
  delete from private.paylink_accounts where coach_id=coach;
  return false;
 end if;
 insert into private.paylink_accounts(coach_id,sealed) values(coach,sealed)
 on conflict(coach_id) do update set sealed=excluded.sealed,updated_at=now();
 return true;
end $$;

create function public.paylink_ready_coaches(coaches uuid[]) returns uuid[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(coach_id),'{}') from private.paylink_accounts where coach_id=any(coaches)
$$;

-- What a trainee may pay: only their own, active subscription, and only what is still owed.
create function public.paylink_checkout_context(trainee uuid, subscription uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.subscriptions; c public.clients; paid numeric;
begin
 select * into s from public.subscriptions where id=subscription;
 if s.id is null then return null; end if;
 select * into c from public.clients where id=s.client_id and coach_id=s.coach_id and trainee_user_id=trainee and not archived;
 if c.id is null then return null; end if;
 select coalesce(sum(amount),0) into paid from public.payments where subscription_id=s.id;
 return jsonb_build_object(
  'coach_id',s.coach_id,'client_id',c.id,'subscription_id',s.id,'subscription_name',s.name,
  'price',s.price,'outstanding',greatest(s.price-paid,0),
  'client_name',c.name,'client_email',c.email,'client_phone',c.phone,
  'recent_invoices',(select count(*) from public.paylink_invoices where subscription_id=s.id and created_at>now()-interval '1 hour'),
  'pending',coalesce((select jsonb_agg(jsonb_build_object('order_number',i.order_number,'transaction_no',i.transaction_no,'amount',i.amount,'payment_url',i.payment_url,'created_at',i.created_at,'expires_at',i.expires_at) order by i.created_at desc)
   from public.paylink_invoices i where i.subscription_id=s.id and i.status='pending' and i.transaction_no is not null and i.expires_at>now()-interval '1 day'),'[]'::jsonb)
 );
end $$;

create function public.paylink_invoice_open(coach uuid, subscription uuid, client uuid, order_no text, total numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 perform id from public.subscriptions where id=subscription and coach_id=coach and client_id=client for update;
 if not found then raise exception 'Subscription not found'; end if;
 if (select count(*) from public.paylink_invoices where subscription_id=subscription and created_at>now()-interval '1 hour')>=6 then
  raise exception 'Too many invoices' using errcode='P0429';
 end if;
 insert into public.paylink_invoices(coach_id,subscription_id,client_id,order_number,amount)
 values(coach,subscription,client,order_no,total) returning id into rid;
 return rid;
end $$;

create function public.paylink_invoice_attach(order_no text, transaction text, url text) returns boolean
language sql security definer set search_path='' as $$
 update public.paylink_invoices set transaction_no=transaction,payment_url=url
 where order_number=order_no and transaction_no is null returning true
$$;

-- A Paylink call that failed before a transaction existed leaves nothing payable.
create function public.paylink_invoice_abandon(order_no text) returns boolean
language sql security definer set search_path='' as $$
 update public.paylink_invoices set status='failed' where order_number=order_no and transaction_no is null and status='pending' returning true
$$;

create function public.paylink_invoice_lookup(transaction text, order_no text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'coach_id',coach_id,'subscription_id',subscription_id,'client_id',client_id,
  'order_number',order_number,'transaction_no',transaction_no,'amount',amount,'status',status,
  'payment_errors',payment_errors,'review_reason',review_reason)
 from public.paylink_invoices
 where (transaction is not null and transaction_no=transaction) or (transaction is null and order_number=order_no)
 limit 1
$$;

-- Records a verified payment exactly once. The caller has already confirmed with
-- getInvoice that the order is Paid and has passed the amount Paylink reported.
create function public.paylink_invoice_settle(transaction text, paid_amount numeric, method_type text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare inv public.paylink_invoices; s public.subscriptions; paid numeric; pid uuid:=gen_random_uuid(); reason text;
begin
 select * into inv from public.paylink_invoices where transaction_no=transaction for update;
 if inv.id is null then raise exception 'Invoice not found'; end if;
 if inv.status='paid' then return jsonb_build_object('outcome','duplicate','payment_id',inv.payment_id); end if;
 if inv.status='review' then return jsonb_build_object('outcome','review','reason',inv.review_reason); end if;
 select * into s from public.subscriptions where id=inv.subscription_id and coach_id=inv.coach_id for update;
 select coalesce(sum(amount),0) into paid from public.payments where subscription_id=s.id;
 if paid_amount is null or abs(paid_amount-inv.amount)>=0.01 then reason:='amount_mismatch';
 elsif paid+inv.amount>s.price then reason:='exceeds_balance'; end if;
 if reason is not null then
  update public.paylink_invoices set status='review',review_reason=reason,payment_type=left(method_type,40),settled_at=now() where id=inv.id;
  return jsonb_build_object('outcome','review','reason',reason);
 end if;
 insert into public.payments(id,coach_id,subscription_id,amount,method,paid_date,reference,kind)
 values(pid,inv.coach_id,s.id,inv.amount,'paylink',(now() at time zone 'Asia/Riyadh')::date,'paylink:'||transaction,'payment');
 update public.paylink_invoices set status='paid',payment_id=pid,payment_type=left(method_type,40),payment_errors='[]'::jsonb,settled_at=now() where id=inv.id;
 return jsonb_build_object('outcome','activated','payment_id',pid);
end $$;

-- Non-paid states only. A paid or held-for-review invoice never moves back.
create function public.paylink_invoice_mark(transaction text, next_status text, errors jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if next_status not in ('pending','canceled','failed') then raise exception 'Invalid status'; end if;
 update public.paylink_invoices set status=next_status,
  payment_errors=case when jsonb_typeof(errors)='array' then errors else payment_errors end
 where transaction_no=transaction and status in ('pending','canceled','failed');
 return found;
end $$;

do $$ declare f text; begin
 foreach f in array array[
  'public.paylink_account_get(uuid)','public.paylink_account_put(uuid,text)','public.paylink_ready_coaches(uuid[])',
  'public.paylink_checkout_context(uuid,uuid)','public.paylink_invoice_open(uuid,uuid,uuid,text,numeric)',
  'public.paylink_invoice_attach(text,text,text)','public.paylink_invoice_abandon(text)',
  'public.paylink_invoice_lookup(text,text)','public.paylink_invoice_settle(text,numeric,text)',
  'public.paylink_invoice_mark(text,text,jsonb)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,coach_api',f);
  if exists(select 1 from pg_roles where rolname='service_role') then execute format('grant execute on function %s to service_role',f); end if;
 end loop;
end $$;
