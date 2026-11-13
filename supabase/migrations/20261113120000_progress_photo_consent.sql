-- Recorded, versioned consent before progress photos. Only the trainee (through
-- the account or the personal link) can accept or revoke. Uploads by anyone,
-- coach included, require an active consent for the current notice version.
-- Rollback: supabase/rollbacks/20261113120000_progress_photo_consent.down.sql

create table public.client_consents (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null,
 coach_id uuid not null,
 consent_type text not null check (consent_type in ('progress_photos')),
 version integer not null check (version > 0),
 accepted_at timestamptz not null default now(),
 revoked_at timestamptz,
 accepted_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key (client_id, coach_id) references public.clients(id, coach_id) on delete cascade
);
create unique index one_active_client_consent on public.client_consents(client_id, consent_type) where revoked_at is null;
create index client_consent_history on public.client_consents(client_id, consent_type, accepted_at desc);
alter table public.client_consents enable row level security;
revoke all on public.client_consents from public, anon, authenticated;
grant select on public.client_consents to authenticated, coach_api;
create policy consent_read on public.client_consents for select to authenticated, coach_api using (
 coach_id = (select private.session_uid())
 or exists(select 1 from public.clients c where c.id = client_id and c.trainee_user_id = (select private.session_uid()) and not c.archived));

-- Bump with a new migration whenever the notice text changes (lib/photo-consent.ts).
create function private.photo_consent_version() returns integer language sql immutable set search_path='' as $$ select 1 $$;
create function private.photo_consent_active(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.client_consents where client_id = target and consent_type = 'progress_photos'
  and revoked_at is null and version >= private.photo_consent_version())
$$;
create function private.photo_consent_state(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'client_id', target,
  'current_version', private.photo_consent_version(),
  'status', case when latest.id is null then 'none'
                 when latest.revoked_at is not null then 'revoked'
                 when latest.version < private.photo_consent_version() then 'outdated'
                 else 'accepted' end,
  'version', latest.version, 'accepted_at', latest.accepted_at, 'revoked_at', latest.revoked_at)
 from (select null) seed
 left join lateral (select * from public.client_consents where client_id = target and consent_type = 'progress_photos'
  order by accepted_at desc, created_at desc limit 1) latest on true
$$;
revoke all on function private.photo_consent_version(), private.photo_consent_active(uuid), private.photo_consent_state(uuid) from public, anon;
grant execute on function private.photo_consent_version(), private.photo_consent_active(uuid), private.photo_consent_state(uuid) to authenticated, coach_api;

create function public.photo_consent(command text, target uuid, notice_version integer default null, delete_photos boolean default false,
 portal_hash text default null, proof text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); c public.clients; access jsonb; active public.client_consents; deleted jsonb := '[]'; begin
 if command not in ('accept', 'revoke') then raise exception 'عملية غير صالحة'; end if;
 if portal_hash is not null then
  access := private.portal_access(portal_hash, proof);
  if access ? 'error' then return access; end if;
  select cl.* into c from public.portal_links l join public.clients cl on cl.id = l.client_id
   where l.token_hash = portal_hash and cl.id = target and not cl.archived for update of cl;
  uid := null;
 else
  -- The coach can never consent on the trainee's behalf.
  select * into c from public.clients where id = target and trainee_user_id = uid and not archived for update;
 end if;
 if c.id is null then raise exception 'الموافقة متاحة للمتدرب نفسه فقط' using errcode = '42501'; end if;
 select * into active from public.client_consents where client_id = c.id and consent_type = 'progress_photos' and revoked_at is null for update;
 if command = 'accept' then
  if notice_version is distinct from private.photo_consent_version() then raise exception 'تحدّث نص الإشعار. حدّث الصفحة واقرأه قبل الموافقة'; end if;
  if active.id is not null and active.version = notice_version then return private.photo_consent_state(c.id); end if;
  if active.id is not null then update public.client_consents set revoked_at = now() where id = active.id; end if;
  insert into public.client_consents(client_id, coach_id, consent_type, version, accepted_by)
   values(c.id, c.coach_id, 'progress_photos', notice_version, uid);
  insert into public.audit(coach_id, actor_id, action, entity_id, detail)
   values(c.coach_id, coalesce(uid, c.id), 'موافقة المتدرب على صور التقدم', c.id, format('نسخة الإشعار %s', notice_version));
 else
  if active.id is not null then update public.client_consents set revoked_at = now() where id = active.id; end if;
  if delete_photos then
   -- The deletion trigger queues every private file for removal from storage.
   select coalesce(jsonb_agg(id), '[]') into deleted from public.progress_photos where client_id = c.id;
   delete from public.progress_photos where client_id = c.id;
  end if;
  insert into public.audit(coach_id, actor_id, action, entity_id, detail)
   values(c.coach_id, coalesce(uid, c.id), 'إيقاف المتدرب لصور التقدم', c.id,
    case when delete_photos then format('مع حذف الصور السابقة (%s)', jsonb_array_length(deleted)) else 'مع الاحتفاظ بالصور السابقة' end);
 end if;
 return private.photo_consent_state(c.id) || jsonb_build_object('deleted_photo_ids', deleted);
end $$;
revoke all on function public.photo_consent(text, uuid, integer, boolean, text, text) from public;
grant execute on function public.photo_consent(text, uuid, integer, boolean, text, text) to anon, authenticated;

create function public.photo_consent_snapshot() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(private.photo_consent_state(c.id)), '[]'::jsonb) from public.clients c
 where c.coach_id = auth.uid() or (c.trainee_user_id = auth.uid() and not c.archived)
$$;
revoke all on function public.photo_consent_snapshot() from public, anon;
grant execute on function public.photo_consent_snapshot() to authenticated;

create function public.portal_photo_consent(token_hash text, proof text) returns jsonb language plpgsql security definer set search_path='' as $$
declare access jsonb; cid uuid; begin
 access := private.portal_access(token_hash, proof);
 if access ? 'error' then return access; end if;
 select l.client_id into cid from public.portal_links l where l.token_hash = portal_photo_consent.token_hash;
 return private.photo_consent_state(cid);
end $$;
revoke all on function public.portal_photo_consent(text, text) from public;
grant execute on function public.portal_photo_consent(text, text) to anon, authenticated;

-- Server-side gate on every upload path.
do $$ declare definition text; marker text := 'is not true then raise exception ''يلزم تأكيد موافقة المتدرب على رفع الصور''; end if;'; begin
 select pg_get_functiondef('private.photo_command(text,jsonb)'::regprocedure) into definition;
 if position(marker in definition) = 0 then raise exception 'photo_command consent check changed'; end if;
 execute replace(definition, marker, marker || chr(10) ||
  '      if not private.photo_consent_active(c.id) then raise exception ''رفع الصور يحتاج موافقة المتدرب على إشعار صور التقدم''; end if;');
 select pg_get_functiondef('private.portal_management(text,text,text,jsonb)'::regprocedure) into definition;
 if position(marker in definition) = 0 then raise exception 'portal_management consent check changed'; end if;
 execute replace(definition, marker, marker || chr(10) ||
  '  if not private.photo_consent_active(cid) then raise exception ''رفع الصور يحتاج موافقة المتدرب على إشعار صور التقدم''; end if;');
end $$;
