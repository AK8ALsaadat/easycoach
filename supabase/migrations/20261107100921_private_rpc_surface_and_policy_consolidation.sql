-- Reduce the exposed API to thin invoker wrappers. The privileged implementations
-- keep their identity checks, ACLs and (for app_command) a non-BYPASSRLS owner.
create schema if not exists private;
grant usage on schema private to authenticated,anon,coach_api;
alter function public.latest_program(uuid) set schema private;
alter function public.session_uid() set schema private;
alter function public.app_command(text,jsonb) set schema private;
alter function public.init_profile(text,text) set schema private;
alter function public.claim_invite(text) set schema private;
alter function public.public_link_info(text,text) set schema private;
alter function public.request_join(text,text,text,text) set schema private;
do $$ declare definition text; begin
 select pg_get_functiondef('private.app_command(text,jsonb)'::regprocedure) into definition;
 execute replace(definition,'public.session_uid()','private.session_uid()');
end $$;
create function public.app_command(command text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.app_command(command,payload) $$;
create function public.init_profile(display_name text,requested_role text) returns jsonb language sql security invoker set search_path='' as $$ select private.init_profile(display_name,requested_role) $$;
create function public.claim_invite(token text) returns boolean language sql security invoker set search_path='' as $$ select private.claim_invite(token) $$;
create function public.public_link_info(token text,link_type text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.public_link_info(token,link_type) $$;
create function public.request_join(token text,display_name text,contact_email text,contact_phone text) returns boolean language sql security invoker set search_path='' as $$ select private.request_join(token,display_name,contact_email,contact_phone) $$;
revoke all on function public.app_command(text,jsonb),public.init_profile(text,text),public.claim_invite(text) from public,anon;
grant execute on function public.app_command(text,jsonb),public.init_profile(text,text),public.claim_invite(text) to authenticated;
revoke all on function public.public_link_info(text,text),public.request_join(text,text,text,text) from public;
grant execute on function public.public_link_info(text,text),public.request_join(text,text,text,text) to anon,authenticated;

-- Preserve the exact OR semantics while avoiding duplicate permissive policies.
-- Each tenant table ends with one policy per operation. No table data is changed.
do $$ declare t text; p record; read_predicate text; insert_predicate text; update_predicate text; update_check text; delete_predicate text; begin
 foreach t in array array['clients','exercises','templates','programs','subscriptions','freezes','payments','invitations','join_links','join_requests','privacy_requests'] loop
  select string_agg('('||qual||')',' OR ') into read_predicate from pg_policies where schemaname='public' and tablename=t and cmd in ('SELECT','ALL');
  select string_agg('('||coalesce(with_check,qual)||')',' OR ') into insert_predicate from pg_policies where schemaname='public' and tablename=t and cmd in ('INSERT','ALL');
  select string_agg('('||qual||')',' OR '),string_agg('('||coalesce(with_check,qual)||')',' OR ') into update_predicate,update_check from pg_policies where schemaname='public' and tablename=t and cmd in ('UPDATE','ALL');
  select string_agg('('||qual||')',' OR ') into delete_predicate from pg_policies where schemaname='public' and tablename=t and cmd in ('DELETE','ALL');
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t); end loop;
  execute format('create policy tenant_select on public.%I for select to authenticated,coach_api using(%s)',t,coalesce(read_predicate,'false'));
  execute format('create policy tenant_insert on public.%I for insert to authenticated,coach_api with check(%s)',t,coalesce(insert_predicate,'false'));
  execute format('create policy tenant_update on public.%I for update to authenticated,coach_api using(%s) with check(%s)',t,coalesce(update_predicate,'false'),coalesce(update_check,'false'));
  execute format('create policy tenant_delete on public.%I for delete to authenticated,coach_api using(%s)',t,coalesce(delete_predicate,'false'));
 end loop;
end $$;

-- Supabase's project bootstrap event-trigger function is not a public RPC.
do $$ declare function_record record; begin
 for function_record in select routine.oid::regprocedure as signature from pg_proc routine join pg_namespace n on n.oid=routine.pronamespace where n.nspname='public' and routine.proname='rls_auto_enable' and pg_get_userbyid(routine.proowner)=current_user loop
  execute format('revoke execute on function %s from public,anon,authenticated',function_record.signature);
 end loop;
end $$;
