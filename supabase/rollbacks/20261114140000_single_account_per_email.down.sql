-- Restores init_profile without the shared-email check and drops the report.
create or replace function public.init_profile(display_name text, requested_role text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u record; begin
 select id,email,email_confirmed_at into u from auth.users where id=auth.uid();
 if u.id is null or u.email_confirmed_at is null then raise exception 'تحقق من إيميلك أولًا'; end if;
 if requested_role not in ('coach','trainee') then raise exception 'دور غير صالح'; end if;
 insert into public.profiles(id,name,email,role) values(u.id,display_name,lower(u.email),requested_role) on conflict(id) do nothing;
 return (select to_jsonb(p) from public.profiles p where id=u.id);
end $$;
revoke all on function public.init_profile(text,text) from public,anon;
grant execute on function public.init_profile(text,text) to authenticated;
drop view if exists private.duplicate_profile_emails;
drop index if exists public.profiles_email_lower_idx;
