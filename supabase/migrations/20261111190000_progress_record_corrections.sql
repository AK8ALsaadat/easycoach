-- Corrections retain attribution and an internal previous version. Explicit
-- deletion erases both the visible record and its private revision history.
alter table public.coaching_records add column updated_at timestamptz;
update public.coaching_records set updated_at=created_at;
alter table public.coaching_records alter column updated_at set default clock_timestamp();
alter table public.coaching_records alter column updated_at set not null;
alter table public.coaching_records add column revision integer not null default 1 check(revision>0);
alter table public.coaching_records add column modified_by_type text check(modified_by_type in ('coach','client'));
create table private.coaching_record_versions (
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references public.coaching_records(id) on delete cascade,
 previous_entry_date date not null, previous_payload jsonb not null,
 previous_revision integer not null, changed_at timestamptz not null default clock_timestamp(),
 actor_id uuid references public.profiles(id), actor_type text not null check(actor_type in ('coach','client'))
);
alter table private.coaching_record_versions enable row level security;
revoke all on private.coaching_record_versions from public,anon,authenticated,coach_api;

-- Preserve the original append-only boundary for every legacy writer. Only a
-- guarded correction with an exact previous-version record may change values.
create or replace function private.protect_record_history() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.client_id<>old.client_id or new.coach_id<>old.coach_id or new.kind<>old.kind or new.source_key<>old.source_key or new.author_id is distinct from old.author_id or new.author_type<>old.author_type then
  raise exception 'لا يمكن تغيير هوية السجل أو إسناده';
 end if;
 if new.payload<>old.payload or new.entry_date<>old.entry_date then
  if new.revision<>old.revision+1 or not exists(select 1 from private.coaching_record_versions v where v.record_id=old.id and v.previous_revision=old.revision and v.previous_payload=old.payload and v.previous_entry_date=old.entry_date) then
   raise exception 'السجل التاريخي ثابت؛ استخدم التصحيح المحمي';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.protect_record_history() from public,anon,authenticated;

create function private.stamp_coaching_review() returns trigger language plpgsql set search_path='' as $$ begin
 if new.coach_feedback is distinct from old.coach_feedback or new.reviewed_at is distinct from old.reviewed_at then
  new.updated_at:=clock_timestamp(); new.modified_by_type:='coach';
  if new.revision<=old.revision then new.revision:=old.revision+1; end if;
 end if;
 return new;
end $$;
revoke all on function private.stamp_coaching_review() from public,anon,authenticated;
create trigger stamp_coaching_review before update on public.coaching_records for each row execute function private.stamp_coaching_review();

create function public.progress_record_change(command text,target_client uuid,record_id uuid,
 expected_updated_at timestamptz,entry_date date default null,value jsonb default null,
 portal_hash text default null,proof text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); c public.clients; r public.coaching_records; access jsonb;
 portal_client uuid; is_coach boolean:=false; actor_type text; photo text;
begin
 if command not in ('edit','delete','review') then raise exception 'عملية غير صالحة'; end if;
 if portal_hash is not null then
  access:=private.portal_access(portal_hash,proof);
  if access ? 'error' then return access; end if;
  select l.client_id into portal_client from public.portal_links l where l.token_hash=portal_hash;
  if portal_client is distinct from target_client then raise exception 'السجل غير متاح'; end if;
  select * into c from public.clients where id=target_client and not archived for update;
  uid:=null;
 else
  if uid is null then raise exception 'يلزم تسجيل الدخول' using errcode='42501'; end if;
  select * into c from public.clients where id=target_client and not archived and (coach_id=uid or trainee_user_id=uid) for update;
  is_coach:=c.coach_id=uid;
 end if;
 if c.id is null then raise exception 'السجل غير متاح' using errcode='42501'; end if;
 select * into r from public.coaching_records where id=record_id and client_id=c.id for update;
 if r.id is null then
  if command='delete' then return jsonb_build_object('deleted',true,'id',record_id); end if;
  raise exception 'السجل غير متاح';
 end if;
 if r.kind not in ('measurement','checkin') or coalesce((r.payload->>'historical_only')::boolean,false) then raise exception 'لا يمكن تعديل سجل تاريخي أو خاص من هذا الموضع'; end if;
 if not is_coach and (r.author_type<>'client' or (portal_hash is null and r.author_id is not null and r.author_id<>uid)) then
  raise exception 'يمكنك تعديل تحديثاتك فقط' using errcode='42501';
 end if;
 if command='edit' and r.entry_date=entry_date and r.payload=value then return to_jsonb(r); end if;
 if command='review' then
  if not is_coach then raise exception 'هذه العملية للمدرب فقط' using errcode='42501'; end if;
  if value is null or jsonb_typeof(value->'feedback') is distinct from 'string' or length(value->>'feedback')>4000 or value-array['feedback']<>'{}'::jsonb then raise exception 'رد المدرب غير صالح'; end if;
  if r.coach_feedback=value->>'feedback' and r.reviewed_at is not null then return to_jsonb(r); end if;
 end if;
 if expected_updated_at is null or r.updated_at is distinct from expected_updated_at then raise exception 'تغير السجل من نافذة أخرى. حدّثه قبل التصحيح أو الحذف'; end if;
 if command='delete' then
  delete from public.coaching_records where id=r.id;
  return jsonb_build_object('deleted',true,'id',r.id);
 end if;
 if command='review' then
  update public.coaching_records set coach_feedback=value->>'feedback',reviewed_at=clock_timestamp(),
   updated_at=clock_timestamp(),revision=r.revision+1,modified_by_type='coach' where id=r.id returning * into r;
  return to_jsonb(r);
 end if;
 if entry_date is null or entry_date<'1900-01-01' or entry_date>(now() at time zone 'Asia/Riyadh')::date or value is null or not private.valid_coaching_record(r.kind,value) then
  raise exception 'تحقق من التاريخ والقيم والوحدات';
 end if;
 for photo in select jsonb_array_elements_text(coalesce(value->'photo_ids','[]')) loop
  if not exists(select 1 from public.progress_photos where id=photo::uuid and client_id=c.id and status='ready') then raise exception 'الصورة غير متاحة لهذا المتدرب'; end if;
 end loop;
 actor_type:=case when is_coach then 'coach' else 'client' end;
 insert into private.coaching_record_versions(record_id,previous_entry_date,previous_payload,previous_revision,actor_id,actor_type)
 values(r.id,r.entry_date,r.payload,r.revision,uid,actor_type);
 update public.coaching_records set entry_date=progress_record_change.entry_date,payload=value,
  updated_at=clock_timestamp(),revision=r.revision+1,modified_by_type=actor_type
 where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.progress_record_change(text,uuid,uuid,timestamptz,date,jsonb,text,text) from public;
grant execute on function public.progress_record_change(text,uuid,uuid,timestamptz,date,jsonb,text,text) to authenticated,anon;

-- A corrected weight is ordered by its last modification, not its old creation date.
do $$ declare definition text; fn text; begin
 foreach fn in array array['private.management_snapshot()','private.portal_management(text,text,text,jsonb)'] loop
  select pg_get_functiondef(fn::regprocedure) into definition;
  definition:=replace(definition,'(payload->>''weight'')::numeric,created_at from public.coaching_records','(payload->>''weight'')::numeric,updated_at from public.coaching_records');
  definition:=replace(definition,'(r.payload->>''weight'')::numeric,created_at from public.coaching_records r','(r.payload->>''weight'')::numeric,r.updated_at from public.coaching_records r');
  definition:=replace(definition,'''consented_at'',p.consented_at,''created_at'',p.created_at','''consented_at'',p.consented_at,''created_at'',p.created_at,''consent_source'',p.consent_source');
  execute definition;
 end loop;
end $$;
