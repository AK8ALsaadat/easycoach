-- Durable, atomic exchange throttling across server instances. Only trusted
-- application code supplies an edge-derived, daily rotating IP hash.
create table private.portal_exchange_limits (
 key_hash text primary key check(key_hash ~ '^[a-f0-9]{64}$'),
 window_start timestamptz not null default clock_timestamp(),
 attempts integer not null check(attempts between 1 and 31)
);
create index portal_exchange_limits_expiry on private.portal_exchange_limits(window_start);
alter table private.portal_exchange_limits enable row level security;
revoke all on private.portal_exchange_limits from public,anon,authenticated,coach_api;

create function public.portal_exchange_rate_limit(key_hash text) returns integer
language plpgsql security definer set search_path='' as $$
declare request_time timestamptz:=clock_timestamp(); entry private.portal_exchange_limits;
begin
 if key_hash is null or key_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid rate key'; end if;
 -- Retain no inactive IP hash beyond a day of subsequent traffic.
 delete from private.portal_exchange_limits where window_start<request_time-interval '1 day';
 insert into private.portal_exchange_limits as limits(key_hash,window_start,attempts)
 values(key_hash,request_time,1)
 on conflict on constraint portal_exchange_limits_pkey do update set
  window_start=case when limits.window_start<=request_time-interval '15 minutes' then request_time else limits.window_start end,
  attempts=case when limits.window_start<=request_time-interval '15 minutes' then 1 else least(limits.attempts+1,31) end
 returning * into entry;
 if entry.attempts<=30 then return 0; end if;
 return greatest(1,ceil(extract(epoch from entry.window_start+interval '15 minutes'-request_time))::integer);
end $$;
revoke all on function public.portal_exchange_rate_limit(text) from public,anon,authenticated,coach_api;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.portal_exchange_rate_limit(text) to service_role;
 end if;
end $$;
