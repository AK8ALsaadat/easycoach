-- Serialize checkout creation across workers, including unresolved remote calls.
-- Existing invoices remain intact; they also block replacement until reconciled.
create function public.paylink_invoice_reserve(coach uuid, subscription uuid, client uuid, order_no text, total numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.subscriptions; paid numeric;
begin
 select * into s from public.subscriptions where id=subscription and coach_id=coach and client_id=client for update;
 if s.id is null then raise exception 'Subscription not found'; end if;
 if exists(select 1 from public.paylink_invoices where subscription_id=subscription and status in ('pending','review')) then
  raise exception 'Checkout awaiting reconciliation' using errcode='P0409';
 end if;
 select coalesce(sum(amount),0) into paid from public.payments where subscription_id=subscription;
 if total<>s.price-paid or total<5 then
  raise exception 'Subscription balance changed' using errcode='P0409';
 end if;
 return public.paylink_invoice_open(coach,subscription,client,order_no,total);
end $$;
revoke all on function public.paylink_invoice_reserve(uuid,uuid,uuid,text,numeric) from public,anon,authenticated,coach_api;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.paylink_invoice_reserve(uuid,uuid,uuid,text,numeric) to service_role;
 end if;
end $$;
