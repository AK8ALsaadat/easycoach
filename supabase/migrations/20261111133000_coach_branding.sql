-- Small, sanitized coach portraits are branding assets, intentionally shareable.
-- They are separate from private trainee media. No access rules are changed.
create table public.coach_branding (
 coach_id uuid primary key references public.profiles(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=120),
 avatar_id uuid unique,
 avatar_base64 text,
 updated_at timestamptz not null default clock_timestamp(),
 check ((avatar_id is null and avatar_base64 is null) or
        (avatar_id is not null and avatar_base64 is not null and
         length(avatar_base64) between 8 and 350000 and
         left(avatar_base64,4)='/9j/'))
);
alter table public.coach_branding enable row level security;
revoke all on public.coach_branding from public,anon,authenticated;

create function private.coach_identity(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('coach_id',p.id,'name',coalesce(nullif(b.display_name,''),p.name),
   'display_name',coalesce(b.display_name,''),'avatar_id',b.avatar_id,'updated_at',b.updated_at)
 from public.profiles p left join public.coach_branding b on b.coach_id=p.id
 where p.id=target and p.role='coach'
$$;
revoke all on function private.coach_identity(uuid) from public,anon,authenticated;

create function public.coach_branding_snapshot() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(private.coach_identity(p.id)),'[]'::jsonb)
 from public.profiles p where p.role='coach' and
 (p.id=auth.uid() or exists(select 1 from public.clients c
  where c.coach_id=p.id and c.trainee_user_id=auth.uid() and not c.archived))
$$;
revoke all on function public.coach_branding_snapshot() from public,anon;
grant execute on function public.coach_branding_snapshot() to authenticated;

create function public.coach_branding_save(display_name text,change_avatar boolean,
 avatar_data text,expected_version text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); current_version timestamptz; begin
 if uid is null or not exists(select 1 from public.profiles p where p.id=uid and p.role='coach') then
  raise exception 'هذه الإعدادات للمدرب فقط' using errcode='42501';
 end if;
 -- Serialize changes even when no branding row exists yet.
 perform 1 from public.profiles where id=uid for update;
 select b.updated_at into current_version from public.coach_branding b where b.coach_id=uid;
 if current_version is distinct from expected_version::timestamptz then
  raise exception 'تغيرت الهوية من نافذة أخرى. حدّث الصفحة قبل الحفظ';
 end if;
 if display_name is null or length(trim(display_name))>120 or (length(trim(display_name))=1) then
  raise exception 'اكتب اسمًا بين حرفين و120 حرفًا، أو اتركه فارغًا للاسم الافتراضي';
 end if;
 insert into public.coach_branding(coach_id,display_name,avatar_id,avatar_base64)
 values(uid,trim(display_name),case when change_avatar and avatar_data is not null then gen_random_uuid() end,
  case when change_avatar then avatar_data end)
 on conflict(coach_id) do update set display_name=excluded.display_name,
  avatar_id=case when change_avatar then excluded.avatar_id else coach_branding.avatar_id end,
  avatar_base64=case when change_avatar then excluded.avatar_base64 else coach_branding.avatar_base64 end,
  updated_at=clock_timestamp();
 return private.coach_identity(uid);
end $$;
revoke all on function public.coach_branding_save(text,boolean,text,text) from public,anon;
grant execute on function public.coach_branding_save(text,boolean,text,text) to authenticated;

-- Link previews expose ONLY coach branding, never trainee names, contact info or plans.
create function public.coach_branding_link(token_hash text,link_type text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cid uuid; identity jsonb; begin
 if token_hash !~ '^[a-f0-9]{64}$' then return null; end if;
 if link_type='p' then
  select l.coach_id into cid from public.portal_links l join public.clients c on c.id=l.client_id
   where l.token_hash=coach_branding_link.token_hash and l.revoked_at is null and l.expires_at>now() and not c.archived;
 elsif link_type='invite' then
  select i.coach_id into cid from public.invitations i join public.clients c on c.id=i.client_id
   where i.token_hash=coach_branding_link.token_hash and i.revoked_at is null and i.consumed_at is null and i.expires_at>now() and not c.archived;
 elsif link_type='join' then
  select l.coach_id into cid from public.join_links l
   where l.token_hash=coach_branding_link.token_hash and l.revoked_at is null and l.expires_at>now();
 end if;
 identity:=private.coach_identity(cid);
 if identity is null then return null; end if;
 return jsonb_build_object('name',identity->'name','avatar_id',identity->'avatar_id');
end $$;
revoke all on function public.coach_branding_link(text,text) from public;
grant execute on function public.coach_branding_link(text,text) to anon,authenticated;

-- A random image revision is intentionally public for social preview crawlers.
-- Replacing/removing a portrait immediately makes its old revision unavailable.
create function public.coach_branding_avatar(asset uuid) returns text
language sql stable security definer set search_path='' as $$
 select b.avatar_base64 from public.coach_branding b where b.avatar_id=asset
$$;
revoke all on function public.coach_branding_avatar(uuid) from public;
grant execute on function public.coach_branding_avatar(uuid) to anon,authenticated;
