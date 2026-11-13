create or replace function public.log_change() returns trigger language plpgsql security definer set search_path='' as $$
declare rowdata jsonb; begin
 rowdata:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.audit(coach_id,actor_id,action,entity_id) values((rowdata->>'coach_id')::uuid,coalesce(auth.uid(),(rowdata->>'coach_id')::uuid),TG_TABLE_NAME||':'||TG_OP,(rowdata->>'id')::uuid);
 return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function public.log_change() from public,anon,authenticated;
alter table public.audit drop column if exists client_id;
