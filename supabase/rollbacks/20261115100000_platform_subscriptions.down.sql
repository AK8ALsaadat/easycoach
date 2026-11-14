-- The seven platform migrations form one rollback unit. Run transactionally.
-- Refuses to discard any attendance, subscription, team or operational history.
-- Export/reconcile those records first; never use CASCADE to bypass this guard.
begin;
do $$ begin
 if exists(select 1 from public.session_attendance) or exists(select 1 from public.subscriptions where session_limit is not null) or exists(select 1 from public.ec_invoices)
 or exists(select 1 from public.ec_consents) or exists(select 1 from public.ec_team)
 or exists(select 1 from public.ec_tasks) or exists(select 1 from public.ec_email_outbox)
 or exists(select 1 from public.ec_branches) or exists(select 1 from public.ec_rules)
 or exists(select 1 from public.ec_accounts where status<>'free') then
 raise exception 'Export/reconcile platform and attendance history before rollback; no data was removed';
 end if;
end $$;
do $$ declare t record; p record; f record; backup record; begin
 for t in select event_object_schema,event_object_table,trigger_name from information_schema.triggers
 where trigger_name in ('ec_profile_created','ec_resource_guard','ec_client_data_guard','ec_metadata_guard') loop
 execute format('drop trigger if exists %I on %I.%I',t.trigger_name,t.event_object_schema,t.event_object_table);
 end loop;
 for p in select schemaname,tablename,policyname from pg_policies where policyname like 'ec_%' loop
 execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
 end loop;
 for backup in select definition from private.ec_rpc_backup loop execute backup.definition; end loop;
 -- Restore the original portal implementations, including their parameter qualifiers.
 drop function private.portal_management(text,text,text,jsonb);
 alter function private.portal_management_before_ec(text,text,text,jsonb) rename to portal_management;
 select pg_get_functiondef('private.portal_management(text,text,text,jsonb)'::regprocedure) as definition into backup;
 execute replace(backup.definition,'portal_management_before_ec.token_hash','portal_management.token_hash');
 grant execute on function private.portal_management(text,text,text,jsonb) to anon,authenticated;
 drop function private.portal_access(text,text,date,numeric,boolean);
 alter function private.portal_access_before_ec(text,text,date,numeric,boolean) rename to portal_access;
 select pg_get_functiondef('private.portal_access(text,text,date,numeric,boolean)'::regprocedure) as definition into backup;
 execute replace(backup.definition,'portal_access_before_ec.token_hash','portal_access.token_hash');
 grant execute on function private.portal_access(text,text,date,numeric,boolean) to anon,authenticated;
 for f in select proc.oid::regprocedure as signature from pg_proc proc join pg_namespace n on n.oid=proc.pronamespace
 where n.nspname in ('public','private') and proc.proname like 'ec_%' loop execute format('drop function %s',f.signature); end loop;
end $$;
drop table public.ec_report_schedules,public.ec_bulk_previews,public.ec_team_audit,public.ec_rules,public.ec_tasks,public.ec_assignments,public.ec_team,public.ec_branches;
drop table public.ec_email_outbox,public.ec_events,public.ec_invoices,public.ec_consents,public.ec_accounts,public.ec_config,public.ec_plans;
drop table public.session_attendance;
alter table public.subscriptions drop column session_limit;
drop index public.ec_active_client_page,public.ec_template_page,public.ec_package_expiry;
drop table private.ec_rpc_backup;
commit;
