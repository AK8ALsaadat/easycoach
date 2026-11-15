-- No historical accounts/conversions are backfilled. Advertising payloads never
-- include emails, phone numbers, workout data, payment references or user IDs.
create table public.ec_user_attribution (
 user_id uuid primary key references auth.users(id) on delete cascade,
 utm_source text,utm_campaign text,utm_content text,ttclid text,
 source text not null check(source in ('email','google')),captured_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.ec_user_attribution enable row level security;
create policy ec_attribution_owner on public.ec_user_attribution for select to authenticated using(user_id=private.session_uid());
grant select on public.ec_user_attribution to authenticated;
revoke insert,update,delete on public.ec_user_attribution from public,anon,authenticated;
create table private.ec_pixel_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(name in ('CompleteRegistration','Subscribe')),source_id text not null,
 properties jsonb not null,claimed_at timestamptz,created_at timestamptz not null default now(),
 unique(user_id,name,source_id)
);
create table private.ec_signup_pixel_receipts (
 token_hash text primary key,user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '24 hours'
);
revoke all on private.ec_pixel_events,private.ec_signup_pixel_receipts from public,anon,authenticated;
create index ec_pixel_pending on private.ec_pixel_events(user_id,created_at) where claimed_at is null;
create function private.ec_analytics_text(value jsonb,key text,max_length integer) returns text language sql immutable set search_path='' as $$
 select case when jsonb_typeof(value->key)='string' then nullif(left(regexp_replace(value->>key,'[[:cntrl:]<>]','','g'),max_length),'') end
$$;
create function private.ec_analytics_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare attributes jsonb; method text; begin
 if new.raw_user_meta_data->>'ec_signup'='true' then method:='email';
 elsif new.raw_app_meta_data->>'provider'='google' then method:='google'; else return new; end if;
 attributes:=coalesce(new.raw_user_meta_data->'marketing_attribution','{}');
 insert into public.ec_user_attribution(user_id,utm_source,utm_campaign,utm_content,ttclid,source,captured_at)
 values(new.id,private.ec_analytics_text(attributes,'utm_source',64),private.ec_analytics_text(attributes,'utm_campaign',120),private.ec_analytics_text(attributes,'utm_content',120),private.ec_analytics_text(attributes,'ttclid',255),method,case when method='email' then now() end);
 insert into private.ec_pixel_events(user_id,name,source_id,properties) values(new.id,'CompleteRegistration','registration','{"content_name":"EasyCoach signup"}') on conflict do nothing;
 return new;
exception when others then
 -- Analytics failures must never break account creation. No user data in logs.
 raise warning 'EasyCoach signup analytics could not be queued'; return new;
end $$;
create trigger ec_analytics_new_user after insert on auth.users for each row execute function private.ec_analytics_new_user();
create function public.ec_analytics_attach_attribution(owner uuid,attributes jsonb) returns boolean language plpgsql security definer set search_path='' as $$ begin
 update public.ec_user_attribution set utm_source=private.ec_analytics_text(attributes,'utm_source',64),utm_campaign=private.ec_analytics_text(attributes,'utm_campaign',120),
 utm_content=private.ec_analytics_text(attributes,'utm_content',120),ttclid=private.ec_analytics_text(attributes,'ttclid',255),captured_at=now()
 where user_id=owner and source='google' and captured_at is null;
 return found;
end $$;
create function public.ec_analytics_issue_receipt(owner uuid,token_hash text) returns boolean language plpgsql security definer set search_path='' as $$ begin
 if token_hash is null or token_hash !~ '^[a-f0-9]{64}$' then return false; end if;
 if not exists(select 1 from private.ec_pixel_events where user_id=owner and name='CompleteRegistration' and claimed_at is null) then return false; end if;
 insert into private.ec_signup_pixel_receipts(token_hash,user_id) values(token_hash,owner);return true;
end $$;
create function private.ec_analytics_paid_invoice() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.status='paid' and new.transaction_ref is not null and new.paid_at is not null then
  insert into private.ec_pixel_events(user_id,name,source_id,properties)
  values(new.owner_id,'Subscribe',new.id::text,jsonb_build_object('content_name','EasyCoach subscription','currency','SAR','value',new.amount_halalas::numeric/100)) on conflict do nothing;
 end if;
 return new;
exception when others then raise warning 'EasyCoach payment analytics could not be queued';return new;
end $$;
create trigger ec_analytics_paid_invoice after insert or update of status on public.ec_invoices for each row execute function private.ec_analytics_paid_invoice();
create function private.ec_analytics_is_paid(source text) returns boolean language plpgsql stable security definer set search_path='' as $$ begin
 if to_regclass('public.ec_invoices') is null then return false; end if;
 return exists(select 1 from public.ec_invoices i where i.id::text=source and i.status='paid' and i.paid_at is not null and i.transaction_ref is not null);
end $$;
create function public.ec_analytics_claim(owner uuid,receipt_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt_owner uuid; events jsonb; begin
 select user_id into receipt_owner from private.ec_signup_pixel_receipts where token_hash=receipt_hash and expires_at>now();
 with candidates as (
  select e.id from private.ec_pixel_events e where e.claimed_at is null and (
   (owner is not null and e.user_id=owner) or (e.name='CompleteRegistration' and e.user_id=receipt_owner))
  and (e.name<>'Subscribe' or private.ec_analytics_is_paid(e.source_id))
  order by e.created_at,e.id limit 20 for update skip locked
 ), claimed as (
  update private.ec_pixel_events e set claimed_at=now() from candidates c where e.id=c.id returning e.id,e.name,e.properties
 ) select coalesce(jsonb_agg(c),'[]') into events from claimed c;
 if receipt_hash is not null then delete from private.ec_signup_pixel_receipts where token_hash=receipt_hash; end if;
 return events;
end $$;
revoke all on function public.ec_analytics_attach_attribution(uuid,jsonb),public.ec_analytics_issue_receipt(uuid,text),public.ec_analytics_claim(uuid,text),private.ec_analytics_text(jsonb,text,integer),private.ec_analytics_new_user(),private.ec_analytics_paid_invoice(),private.ec_analytics_is_paid(text) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.ec_analytics_attach_attribution(uuid,jsonb),public.ec_analytics_issue_receipt(uuid,text),public.ec_analytics_claim(uuid,text) to service_role;
end if;end $$;

-- Privacy notice changed; prior acceptance records remain immutable.
do $$ declare f record;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('ec_billing_start','ec_billing_prepare') loop
  execute replace(pg_get_functiondef(f.oid),'2026-11-15.2','2026-11-15.3');
 end loop;
end $$;
