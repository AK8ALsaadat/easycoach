-- Native Supabase/Postgres scheduling avoids external runner billing limits.
-- Embedded local PostgreSQL does not provide these extensions; tests exercise
-- the dispatcher with a local stub, while hosted installation is verified separately.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron;
 end if;
 if exists(select 1 from pg_available_extensions where name='pg_net') then
  create extension if not exists pg_net with schema extensions;
  revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;
 end if;
end $$;

create function private.ec_invoke_hourly_billing() returns bigint
language plpgsql security definer set search_path='' as $$
declare secret_value text; begin
 if to_regnamespace('vault') is null or to_regnamespace('net') is null then raise exception 'Subscription scheduler extensions are unavailable'; end if;
 select decrypted_secret into secret_value from vault.decrypted_secrets where name='easycoach_subscription_cron_secret';
 if secret_value is null or length(secret_value)<32 then raise exception 'Subscription scheduler secret is not configured in Vault'; end if;
 -- Dates and daily reminders reconcile even when the HTTP worker is delayed.
 perform public.ec_reconcile();
 return net.http_get(url:='https://easycoach.space/api/maintenance/subscriptions',
  headers:=jsonb_build_object('Authorization','Bearer '||secret_value),timeout_milliseconds:=55000);
end $$;
revoke all on function private.ec_invoke_hourly_billing() from public,anon,authenticated;

do $$ begin
 if to_regnamespace('cron') is not null then
  perform cron.schedule('easycoach-subscriptions-hourly','23 * * * *','select private.ec_invoke_hourly_billing();');
 end if;
end $$;
