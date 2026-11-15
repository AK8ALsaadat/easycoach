-- Reversible, non-destructive free access. The application mirrors BILLING_ENABLED
-- through a service-only RPC. No account, invoice, consent, or entitlement is changed.
create table private.ec_runtime_flags (
 singleton boolean primary key default true check(singleton),
 billing_enabled boolean not null default false
);
-- Start with billing ON (current production behavior) so applying this migration before the
-- new code deploys changes nothing. The app then mirrors BILLING_ENABLED on its first request.
insert into private.ec_runtime_flags values(true,true);
revoke all on private.ec_runtime_flags from public,anon,authenticated,coach_api;
create function private.ec_billing_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select billing_enabled from private.ec_runtime_flags where singleton
$$;
revoke all on function private.ec_billing_enabled() from public,anon,authenticated;
create function public.ec_billing_runtime(enabled boolean) returns void language sql security definer set search_path='' as $$
 update private.ec_runtime_flags set billing_enabled=enabled where singleton and billing_enabled is distinct from enabled
$$;
revoke all on function public.ec_billing_runtime(boolean) from public,anon,authenticated,coach_api;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.ec_billing_runtime(boolean) to service_role;
 end if;
end $$;

-- Keep function identities, privileges and dependent policies/triggers intact.
-- Changing the switch to true runs every original guard again.
do $$ declare def text; begin
 def:=pg_get_functiondef('private.ec_plan(uuid)'::regprocedure);
 def:=regexp_replace(def,'\mBEGIN\M',E'BEGIN\n if not private.ec_billing_enabled() and exists(select 1 from public.ec_accounts where owner_id=owner) then return ''business''; end if;', 'i');
 execute def;
 def:=pg_get_functiondef('private.ec_guard_resource()'::regprocedure);
 def:=replace(def,'if to_jsonb(new) ? ''client_id'' and a.selected_clients','if private.ec_billing_enabled() and to_jsonb(new) ? ''client_id'' and a.selected_clients');
 execute def;
 def:=pg_get_functiondef('private.ec_scope(uuid,uuid)'::regprocedure);
 def:=replace(def,'(select count(*)+1 from public.ec_team where owner_id=owner and active)<=(select coach_limit from public.ec_plans where code=private.ec_plan(owner))',
 '(not private.ec_billing_enabled() or (select count(*)+1 from public.ec_team where owner_id=owner and active)<=(select coach_limit from public.ec_plans where code=private.ec_plan(owner)))');
 execute def;
 def:=pg_get_functiondef('public.ec_team_invite(text,text,uuid)'::regprocedure);
 def:=replace(def,'if not exists(select 1 from public.ec_team','if private.ec_billing_enabled() and not exists(select 1 from public.ec_team');
 execute def;
 def:=pg_get_functiondef('public.ec_subscription()'::regprocedure);
 def:=regexp_replace(def,'\mBEGIN\M',E'BEGIN\n if not private.ec_billing_enabled() then\n if not exists(select 1 from public.ec_accounts where owner_id=private.session_uid()) then raise exception ''owner_required''; end if;\n return jsonb_build_object(''effective_plan'',''business'',''features'',(select to_jsonb(features) from public.ec_plans where code=''business''),''limits'',jsonb_build_object(''clients'',null,''templates'',null,''coaches'',null)); end if;', 'i');
 execute def;
 def:=pg_get_functiondef('private.ec_billing_quote(uuid,text)'::regprocedure);
 def:=regexp_replace(def,'\mBEGIN\M',E'BEGIN\n if not private.ec_billing_enabled() then return ''{}''::jsonb; end if;', 'i');
 execute def;
end $$;

-- Existing expiry rules stay stored but cannot create tasks or email in free mode.
do $$ declare def text; begin
 def:=pg_get_functiondef('public.ec_run_automation()'::regprocedure);
 def:=replace(def,'where enabled order by id','where enabled and (private.ec_billing_enabled() or event<>''expiry'') order by id');
 execute def;
end $$;

-- Disable both the database cron and HTTP scheduler paths before expiry or mail.
do $$ declare signature text; def text; begin
 foreach signature in array array['public.ec_reconcile()','public.ec_reconcile_before_lifecycle()'] loop
  def:=pg_get_functiondef(signature::regprocedure);
  def:=regexp_replace(def,'\mBEGIN\M',E'BEGIN\n if not private.ec_billing_enabled() then return ''{"skipped":true}''::jsonb; end if;', 'i'); execute def;
 end loop;
 def:=pg_get_functiondef('public.ec_queue_package_expiry()'::regprocedure);
 def:=regexp_replace(def,'\mBEGIN\M',E'BEGIN\n if not private.ec_billing_enabled() then return 0; end if;', 'i'); execute def;
 -- PGlite has no pg_cron; the production function is still guarded if installed.
 if to_regprocedure('private.ec_invoke_hourly_billing()') is not null then
  def:=pg_get_functiondef('private.ec_invoke_hourly_billing()'::regprocedure);
  def:=regexp_replace(def,'\mBEGIN\M',E'BEGIN\n if not private.ec_billing_enabled() then return null; end if;', 'i'); execute def;
 end if;
end $$;
do $$ declare f record; def text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where n.nspname='public' and p.proname like 'ec_billing_%' and l.lanname='plpgsql' loop
  def:=pg_get_functiondef(f.oid);
  def:=regexp_replace(def,'\mBEGIN\M',E'BEGIN\n if not private.ec_billing_enabled() then raise exception ''billing_disabled'' using errcode=''P0403''; end if;', 'i');
  execute def;
 end loop;
end $$;
-- SQL-only read paths must not leak old financial records or create renewal work.
do $$ declare name text; def text; begin
 foreach name in array array['ec_billing_jobs','ec_billing_overview'] loop
  def:=pg_get_functiondef(format('public.%I()',name)::regprocedure);
  -- Preserve the original query as a private implementation, inaccessible to clients.
  def:=replace(def,format('FUNCTION public.%I(',name),format('FUNCTION private.%I(',name||'_enabled'));
  execute def;
  execute format('revoke all on function private.%I() from public,anon,authenticated,coach_api',name||'_enabled');
 end loop;
end $$;
create or replace function public.ec_billing_jobs() returns jsonb language sql stable security definer set search_path='' as $$
 select case when private.ec_billing_enabled() then private.ec_billing_jobs_enabled() else '[]'::jsonb end
$$;
create or replace function public.ec_billing_overview() returns jsonb language sql stable security definer set search_path='' as $$
 select case when private.ec_billing_enabled() then private.ec_billing_overview_enabled() else '{}'::jsonb end
$$;
