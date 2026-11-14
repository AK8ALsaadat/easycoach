-- One account per email address.
--
-- profiles.email carried no constraint, and init_profile keyed only on the
-- auth user id, so a Google identity and an email/password identity for the
-- same address each created their own coach with their own clients, templates
-- and exercises. The two were indistinguishable in the UI.
--
-- This blocks the second one at the source and reports any collision that
-- already exists. The reporting view is intentionally additive: an existing
-- duplicate pair must be merged by hand before a unique index can be created,
-- and losing a row to a failed index build is not acceptable.
-- Rollback: supabase/rollbacks/20261114140000_single_account_per_email.down.sql

create index if not exists profiles_email_lower_idx on public.profiles(lower(email));

-- Pairs of accounts that share an address. Empty is the healthy state.
create view private.duplicate_profile_emails as
 select lower(p.email) as email, count(*) as accounts,
  jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'role',p.role,'created_at',p.created_at)
   order by p.created_at) as profiles
 from public.profiles p group by lower(p.email) having count(*) > 1;
revoke all on private.duplicate_profile_emails from public,anon,authenticated,coach_api;

create or replace function public.init_profile(display_name text, requested_role text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u record; taken public.profiles; begin
 select id,email,email_confirmed_at into u from auth.users where id=auth.uid();
 if u.id is null or u.email_confirmed_at is null then raise exception 'تحقق من إيميلك أولًا'; end if;
 if requested_role not in ('coach','trainee') then raise exception 'دور غير صالح'; end if;
 -- Serialize competing signups for the same normalized address.
 perform pg_advisory_xact_lock(hashtextextended(lower(u.email), 0));
 -- A verified address already has an account: never start a second one beside
 -- it, or the owner ends up with two workspaces and no way to tell them apart.
 select * into taken from public.profiles where lower(email)=lower(u.email) and id<>u.id limit 1;
 if taken.id is not null then
  raise exception 'هذا البريد له حساب مسبقًا في إيزي كوتش. سجّل الدخول بنفس الطريقة التي أنشأت الحساب بها، أو تواصل مع الدعم لربط الحسابين.';
 end if;
 insert into public.profiles(id,name,email,role) values(u.id,display_name,lower(u.email),requested_role) on conflict(id) do nothing;
 return (select to_jsonb(p) from public.profiles p where id=u.id);
end $$;
revoke all on function public.init_profile(text,text) from public,anon;
grant execute on function public.init_profile(text,text) to authenticated;
