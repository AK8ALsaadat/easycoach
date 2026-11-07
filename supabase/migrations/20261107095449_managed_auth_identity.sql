-- Supabase owns the auth schema: custom non-login roles cannot receive USAGE
-- from tenant postgres. Expose only the current verified identity through a
-- fixed-search-path wrapper; never grant auth.users access or BYPASSRLS.
create function public.session_uid() returns uuid language sql stable security definer set search_path='' as $$ select auth.uid() $$;
revoke all on function public.session_uid() from public,anon;
grant execute on function public.session_uid() to authenticated,coach_api;
do $$ declare p record; expression text; clause text; begin
 for p in select tablename,policyname,qual,with_check from pg_policies where schemaname='public' loop
  clause:='';
  if p.qual is not null then clause:=clause||' using ('||replace(p.qual,'auth.uid()','public.session_uid()')||')'; end if;
  if p.with_check is not null then clause:=clause||' with check ('||replace(p.with_check,'auth.uid()','public.session_uid()')||')'; end if;
  execute format('alter policy %I on public.%I%s',p.policyname,p.tablename,clause);
 end loop;
 select pg_get_functiondef('public.app_command(text,jsonb)'::regprocedure) into expression;
 execute replace(expression,'auth.uid()','public.session_uid()');
end $$;
