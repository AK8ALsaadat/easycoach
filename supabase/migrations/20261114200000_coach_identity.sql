-- Auth metadata may be absent on older accounts. The profile is the authority.
create function public.current_coach_identity() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id) from public.profiles p where p.id=auth.uid() and p.role='coach'
$$;
revoke all on function public.current_coach_identity() from public,anon;
grant execute on function public.current_coach_identity() to authenticated;
