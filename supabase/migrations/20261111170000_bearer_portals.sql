-- New personal links use a fragment credential exchanged for a bounded session.
-- Existing PIN links remain valid and never become bearer links implicitly.
alter table public.portal_links add column access_mode text not null default 'pin'
 check(access_mode in ('pin','bearer'));
create table private.trainee_portal_sessions (
 session_hash text primary key check(session_hash ~ '^[a-f0-9]{64}$'),
 portal_id uuid not null references public.portal_links(id) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days'
);
create index trainee_session_portal on private.trainee_portal_sessions(portal_id,expires_at);
revoke all on private.trainee_portal_sessions from public,anon,authenticated;

create function public.bearer_portal_create(client_id uuid,token_hash text,proof_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb; begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'للمدرب فقط' using errcode='42501'; end if;
 perform 1 from public.clients c where c.id=client_id and c.coach_id=uid and not c.archived for update;
 if not found then raise exception 'العميل غير متاح'; end if;
 update public.portal_links l set revoked_at=now() where l.client_id=bearer_portal_create.client_id and l.revoked_at is null;
 insert into public.portal_links(coach_id,client_id,token_hash,proof_hash,access_mode)
 values(uid,client_id,token_hash,proof_hash,'bearer') returning jsonb_build_object('id',id) into result;
 return result;
end $$;
revoke all on function public.bearer_portal_create(uuid,text,text) from public,anon;
grant execute on function public.bearer_portal_create(uuid,text,text) to authenticated;

create function public.bearer_portal_exchange(portal_id uuid,token_hash text,proof text,session_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare link public.portal_links; begin
 if session_hash !~ '^[a-f0-9]{64}$' then return false; end if;
 select l.* into link from public.portal_links l join public.clients c on c.id=l.client_id
 where l.id=portal_id and l.token_hash=bearer_portal_exchange.token_hash and l.proof_hash=proof
 and l.access_mode='bearer' and l.revoked_at is null and l.expires_at>now() and not c.archived for update of l;
 if link.id is null then return false; end if;
 delete from private.trainee_portal_sessions s where s.portal_id=link.id and s.expires_at<=now();
 if (select count(*) from private.trainee_portal_sessions s where s.portal_id=link.id)>=50 then raise exception 'جلسات كثيرة لهذا الرابط. أعد المحاولة لاحقًا'; end if;
 insert into private.trainee_portal_sessions(session_hash,portal_id) values(session_hash,link.id);
 return true;
end $$;
revoke all on function public.bearer_portal_exchange(uuid,text,text,text) from public;
grant execute on function public.bearer_portal_exchange(uuid,text,text,text) to anon,authenticated;

create function public.portal_session_context(portal_id uuid,session_hash text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('key',l.token_hash,'proof',l.proof_hash)
 from private.trainee_portal_sessions s join public.portal_links l on l.id=s.portal_id
 join public.clients c on c.id=l.client_id
 where s.session_hash=portal_session_context.session_hash and s.portal_id=portal_session_context.portal_id
 and s.expires_at>now() and l.revoked_at is null and l.expires_at>now() and l.access_mode='bearer' and not c.archived
$$;
revoke all on function public.portal_session_context(uuid,text) from public;
grant execute on function public.portal_session_context(uuid,text) to anon,authenticated;

create function public.portal_transport_info(token_hash text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',l.id,'mode',l.access_mode)
 from public.portal_links l join public.clients c on c.id=l.client_id
 where l.token_hash=portal_transport_info.token_hash and l.revoked_at is null and l.expires_at>now() and not c.archived
$$;
revoke all on function public.portal_transport_info(text) from public;
grant execute on function public.portal_transport_info(text) to anon,authenticated;

create function public.public_portal_branding(portal_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',b->'name','avatar_id',b->'avatar_id')
 from public.portal_links l join public.clients c on c.id=l.client_id,
 lateral (select private.coach_identity(l.coach_id) as b) identity
 where l.id=portal_id and l.access_mode='bearer' and l.revoked_at is null and l.expires_at>now() and not c.archived
$$;
revoke all on function public.public_portal_branding(uuid) from public;
grant execute on function public.public_portal_branding(uuid) to anon,authenticated;

create function public.portal_account_invite(token_hash text,proof text,invitation_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link public.portal_links; cl public.clients; result jsonb; begin
 select * into link from public.portal_links l where l.token_hash=portal_account_invite.token_hash for update;
 if link.id is null or link.proof_hash is distinct from proof or link.revoked_at is not null or link.expires_at<=now() then raise exception 'الرابط غير متاح'; end if;
 select * into cl from public.clients where id=link.client_id and not archived for update;
 if cl.id is null then raise exception 'الرابط غير متاح'; end if;
 if cl.trainee_user_id is not null then return jsonb_build_object('linked',true); end if;
 if (select count(*) from public.invitations i where i.client_id=cl.id and i.created_at>now()-interval '1 hour')>=5 then raise exception 'طلبات كثيرة. أعد المحاولة لاحقًا'; end if;
 update public.invitations set revoked_at=now() where client_id=cl.id and consumed_at is null and revoked_at is null;
 insert into public.invitations(coach_id,client_id,email,token_hash,expires_at)
 values(cl.coach_id,cl.id,cl.email,invitation_hash,now()+interval '7 days') returning jsonb_build_object('id',id,'linked',false) into result;
 return result;
end $$;
revoke all on function public.portal_account_invite(text,text,text) from public;
grant execute on function public.portal_account_invite(text,text,text) to anon,authenticated;
