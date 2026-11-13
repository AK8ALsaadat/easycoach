-- Let the change log name the trainee ("حذف قياس وزن — سارة") without storing
-- personal data in the log: keep only the client id, resolved to a name in the UI.
alter table public.audit add column client_id uuid;

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare rowdata jsonb; begin
 rowdata := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.audit(coach_id, actor_id, action, entity_id, client_id)
 values (
   (rowdata->>'coach_id')::uuid,
   coalesce(auth.uid(), (rowdata->>'coach_id')::uuid),
   TG_TABLE_NAME || ':' || TG_OP,
   (rowdata->>'id')::uuid,
   case when TG_TABLE_NAME = 'clients' then (rowdata->>'id')::uuid else nullif(rowdata->>'client_id', '')::uuid end
 );
 return case when TG_OP = 'DELETE' then old else new end;
end $$;
revoke all on function public.log_change() from public, anon, authenticated;

-- Backfill what can still be resolved.
update public.audit set client_id = entity_id
  where client_id is null and (action like 'clients:%' or action in ('أرشفة متدرب', 'استعادة متدرب'));
update public.audit a set client_id = p.client_id from public.programs p where a.client_id is null and a.entity_id = p.id and a.action like 'programs:%';
update public.audit a set client_id = s.client_id from public.subscriptions s where a.client_id is null and a.entity_id = s.id and a.action like 'subscriptions:%';
update public.audit a set client_id = w.client_id from public.weight_entries w where a.client_id is null and a.entity_id = w.id and a.action like 'weight_entries:%';
update public.audit a set client_id = i.client_id from public.invitations i where a.client_id is null and a.entity_id = i.id and a.action like 'invitations:%';
update public.audit a set client_id = s.client_id from public.freezes f join public.subscriptions s on s.id = f.subscription_id where a.client_id is null and a.entity_id = f.id and a.action like 'freezes:%';
update public.audit a set client_id = s.client_id from public.payments p join public.subscriptions s on s.id = p.subscription_id where a.client_id is null and a.entity_id = p.id and a.action like 'payments:%';
