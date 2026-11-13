-- Individual deletion tickets remain scoped to the original coach/client after
-- the photo row is removed. Completion only acknowledges already-removed bytes.
create function public.photo_cleanup_authorized(asset uuid,portal_hash text default null,proof text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.progress_photo_deletions; uid uuid:=auth.uid(); cid uuid; access jsonb;
begin
 select * into job from private.progress_photo_deletions where id=asset for update;
 if job.id is null then return null; end if;
 cid:=split_part(job.asset_path,'/',2)::uuid;
 if portal_hash is not null then
  access:=private.portal_access(portal_hash,proof);
  if access ? 'error' then return access; end if;
  if not exists(select 1 from public.portal_links where token_hash=portal_hash and client_id=cid) then raise exception 'الصورة غير متاحة'; end if;
 elsif uid is null or not(job.coach_id=uid or exists(select 1 from public.clients where id=cid and trainee_user_id=uid and not archived)) then
  raise exception 'الصورة غير متاحة' using errcode='42501';
 end if;
 return jsonb_build_object('id',job.id,'asset_path',job.asset_path);
end $$;
revoke all on function public.photo_cleanup_authorized(uuid,text,text) from public;
grant execute on function public.photo_cleanup_authorized(uuid,text,text) to anon,authenticated;

-- A bounded worker may prune abandoned reservations and retry deletion across
-- coaches. This RPC is never executable with an anon/authenticated account key.
create function public.photo_cleanup_batch(completed jsonb default '[]'::jsonb,prune_abandoned boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if jsonb_typeof(completed)<>'array' or jsonb_array_length(completed)>100 then raise exception 'Invalid cleanup batch'; end if;
 delete from private.progress_photo_deletions where id in (select value::uuid from jsonb_array_elements_text(completed));
 if prune_abandoned then delete from public.progress_photos where id in (
  select id from public.progress_photos where status='pending' and created_at<now()-interval '1 day' order by created_at limit 100
 ); end if;
 select coalesce(jsonb_agg(j),'[]'::jsonb) into result from (
  select id,asset_path from private.progress_photo_deletions order by created_at limit 100
 ) j;
 return result;
end $$;

-- A client may request its jobs but cannot falsely acknowledge that server-side
-- bytes were deleted. Only the service-only batch RPC acknowledges removals.
create or replace function private.photo_cleanup(completed jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); result jsonb;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'Coach access required'; end if;
 if completed is null or jsonb_typeof(completed)<>'array' or jsonb_array_length(completed)<>0 then raise exception 'Only the server may acknowledge deleted files'; end if;
 delete from public.progress_photos where id in (select id from public.progress_photos where coach_id=uid and status='pending' and created_at<now()-interval '1 day' order by created_at limit 100);
 select coalesce(jsonb_agg(j),'[]'::jsonb) into result from (select id,asset_path from private.progress_photo_deletions where coach_id=uid order by created_at limit 100) j;
 return result;
end $$;
revoke all on function public.photo_cleanup_batch(jsonb,boolean) from public,anon,authenticated,coach_api;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.photo_cleanup_batch(jsonb,boolean) to service_role; end if;
end $$;
