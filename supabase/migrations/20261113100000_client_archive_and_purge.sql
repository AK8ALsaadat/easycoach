-- Archive (reversible, default) and permanent deletion (archived trainees only).
-- Archiving keeps every record, hides the trainee from lists/stats, ends portal
-- access and cancels pending invitations and live links. Deletion removes the
-- trainee and all linked rows; storage files are queued by the existing trigger.
-- Rollback: supabase/rollbacks/20261113100000_client_archive_and_purge.down.sql

alter table public.clients
 add column archived_at timestamptz,
 add column archived_reason text check (archived_reason is null or length(archived_reason) <= 500);
update public.clients set archived_at = updated_at where archived and archived_at is null;

create function private.stamp_client_archive() returns trigger language plpgsql set search_path='' as $$ begin
 if new.archived and not old.archived then
  new.archived_at := now();
 elsif not new.archived and old.archived then
  new.archived_at := null; new.archived_reason := null;
 end if;
 return new;
end $$;
revoke all on function private.stamp_client_archive() from public,anon,authenticated;
create trigger stamp_client_archive before update of archived on public.clients
 for each row execute function private.stamp_client_archive();

-- The undo window lets "تراجع" restore exactly what one archive revoked.
create function private.client_archive(input_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid := private.session_uid(); c public.clients; archive boolean := (input_data->>'archived')::boolean;
 reason text := nullif(trim(coalesce(input_data->>'reason','')), ''); result jsonb; begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'هذه العملية للمدرب فقط' using errcode='42501'; end if;
 select * into c from public.clients where id=(input_data->>'client_id')::uuid and coach_id=uid for update;
 if c.id is null then raise exception 'المتدرب غير متاح' using errcode='42501'; end if;
 if reason is not null and length(reason) > 500 then raise exception 'اختصر سبب الأرشفة إلى 500 حرف'; end if;
 if archive then
  if c.archived then return to_jsonb(c); end if;
  update public.clients set archived=true, archived_reason=reason, updated_at=now() where id=c.id returning * into c;
  -- Live links are revoked by client_studio_cleanup in the same statement time.
  update public.invitations set revoked_at=now() where client_id=c.id and consumed_at is null and revoked_at is null;
  insert into public.audit(coach_id,actor_id,action,entity_id,detail) values(uid,uid,'أرشفة متدرب',c.id,coalesce(reason,''));
 else
  if not c.archived then return to_jsonb(c); end if;
  if c.email = c.id::text||'@deleted.invalid' then raise exception 'حُذفت بيانات هذا الملف بطلب خصوصية ولا يمكن استعادته'; end if;
  if c.archived_at > now() - interval '10 minutes' then
   update public.invitations set revoked_at=null where client_id=c.id and revoked_at=c.archived_at and consumed_at is null and expires_at>now();
   update public.portal_links set revoked_at=null where client_id=c.id and revoked_at=c.archived_at and expires_at>now();
  end if;
  update public.clients set archived=false, updated_at=now() where id=c.id returning * into c;
  insert into public.audit(coach_id,actor_id,action,entity_id,detail) values(uid,uid,'استعادة متدرب',c.id,'');
 end if;
 return to_jsonb(c);
end $$;
revoke all on function private.client_archive(jsonb) from public,anon,authenticated;
grant execute on function private.client_archive(jsonb) to coach_api;

do $$ declare definition text; original text; begin
 select pg_get_functiondef('private.management_command(text,jsonb)'::regprocedure) into definition;
 original := 'update public.clients set archived=(input_data->>''archived'')::boolean,updated_at=now() where id=(input_data->>''client_id'')::uuid and coach_id=uid returning to_jsonb(clients) into result;';
 if position(original in definition)=0 then raise exception 'client_archive branch changed'; end if;
 execute replace(definition, original, 'result:=private.client_archive(input_data);');
end $$;

-- Financial rows stay immutable except inside an explicit, coach-owned purge.
create table private.client_purges(txid bigint not null, client_id uuid not null, primary key(txid, client_id));
revoke all on private.client_purges from public,anon,authenticated,coach_api;
create or replace function public.immutable_finance() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='DELETE' and exists(select 1 from private.client_purges p join public.subscriptions s on s.client_id=p.client_id
   where p.txid=txid_current() and s.id=old.subscription_id) then return old; end if;
 raise exception 'السجل ثابت؛ استخدم التصحيح الموثق';
end $$;
revoke all on function public.immutable_finance() from public,anon,authenticated;

create function public.client_purge_summary(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'programs',(select count(*) from public.programs where client_id=c.id),
  'weights',(select count(*) from public.weight_entries where client_id=c.id)
    +(select count(*) from public.coaching_records where client_id=c.id and kind='measurement'),
  'photos',(select count(*) from public.progress_photos where client_id=c.id),
  'messages',(select count(*) from public.coaching_records where client_id=c.id and kind='message'),
  'subscriptions',(select count(*) from public.subscriptions where client_id=c.id),
  'records',(select count(*) from public.coaching_records where client_id=c.id))
 from public.clients c where c.id=target and c.coach_id=auth.uid()
$$;
revoke all on function public.client_purge_summary(uuid) from public,anon;
grant execute on function public.client_purge_summary(uuid) to authenticated;

create function public.client_purge(target uuid, confirm_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); c public.clients; summary jsonb; begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'هذه العملية للمدرب فقط' using errcode='42501'; end if;
 select * into c from public.clients where id=target and coach_id=uid for update;
 if c.id is null then raise exception 'المتدرب غير متاح' using errcode='42501'; end if;
 if not c.archived then raise exception 'أرشف المتدرب أولًا قبل الحذف النهائي'; end if;
 if regexp_replace(trim(coalesce(confirm_name,'')),'\s+',' ','g') <> regexp_replace(trim(c.name),'\s+',' ','g') then
  raise exception 'اكتب اسم المتدرب كما هو بالضبط للتأكيد';
 end if;
 summary := public.client_purge_summary(c.id);
 insert into private.client_purges(txid,client_id) values(txid_current(),c.id) on conflict do nothing;
 delete from public.weight_entries where client_id=c.id;
 delete from public.client_goals where client_id=c.id;
 delete from public.programs where client_id=c.id;
 delete from public.invitations where client_id=c.id;
 delete from public.portal_links where client_id=c.id;
 delete from public.privacy_requests where client_id=c.id;
 delete from public.import_subscription_refs where client_id=c.id;
 delete from public.payments where subscription_id in (select id from public.subscriptions where client_id=c.id) and kind='reversal';
 delete from public.payments where subscription_id in (select id from public.subscriptions where client_id=c.id);
 delete from public.freezes where subscription_id in (select id from public.subscriptions where client_id=c.id);
 delete from public.subscriptions where client_id=c.id;
 delete from public.join_requests where coach_id=uid and email=c.email;
 update public.import_batches b set changes=coalesce((select jsonb_agg(x) from jsonb_array_elements(b.changes) x
  where x->>'id'<>c.id::text and coalesce(x->'after'->>'client_id','')<>c.id::text and coalesce(x->'before'->>'client_id','')<>c.id::text),'[]'::jsonb)
  where coach_id=uid;
 -- Cascades remove details, records, versions, photos (queued for storage deletion), schedules and consents.
 delete from public.clients where id=c.id;
 delete from private.client_purges where txid=txid_current();
 -- No name, email or phone is kept: only counts and the operation.
 insert into public.audit(coach_id,actor_id,action,entity_id,detail) values(uid,uid,'حذف متدرب نهائيًا',null,
  format('برامج: %s · أوزان وقياسات: %s · صور: %s · رسائل: %s · اشتراكات: %s',
   summary->>'programs',summary->>'weights',summary->>'photos',summary->>'messages',summary->>'subscriptions'));
 return jsonb_build_object('deleted',true,'summary',summary);
end $$;
revoke all on function public.client_purge(uuid,text) from public,anon;
grant execute on function public.client_purge(uuid,text) to authenticated;

-- Lets an archived trainee see a friendly "access paused" message instead of an empty portal.
create function public.trainee_access_status() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('client_id',c.id,'coach',private.coach_identity(c.coach_id)->>'name')),'[]'::jsonb)
 from public.clients c where c.trainee_user_id=auth.uid() and c.archived and c.email<>c.id::text||'@deleted.invalid'
$$;
revoke all on function public.trainee_access_status() from public,anon;
grant execute on function public.trainee_access_status() to authenticated;
