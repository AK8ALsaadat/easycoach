-- Scope the existing workspace snapshot inside a single transaction without
-- changing its tenant predicates or impersonating an identity.
create function private.ec_page_contains(target uuid,setting_name text) returns boolean language sql stable set search_path='' as $$
 select case when nullif(current_setting(setting_name,true),'') is null then true
 else target=any(current_setting(setting_name,true)::uuid[]) end
$$;
create function private.ec_page_subscription(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.ec_page_contains(client_id,'easycoach.page_clients') from public.subscriptions where id=target
$$;
do $$ declare t text; begin
 foreach t in array array['programs','subscriptions','client_details','coaching_records','weight_entries','client_goals','progress_photos','portal_links','invitations','privacy_requests','client_checkin_schedules','client_consents'] loop
 execute format('create policy ec_workspace_page on public.%I as restrictive for select to authenticated,coach_api using(private.ec_page_contains(client_id,''easycoach.page_clients''))',t);
 end loop;
 foreach t in array array['payments','freezes'] loop
 execute format('create policy ec_workspace_page on public.%I as restrictive for select to authenticated,coach_api using(private.ec_page_subscription(subscription_id))',t);
 end loop;
end $$;
create policy ec_workspace_page on public.clients as restrictive for select to authenticated,coach_api using(private.ec_page_contains(id,'easycoach.page_clients'));
create policy ec_workspace_page on public.templates as restrictive for select to authenticated,coach_api using(private.ec_page_contains(id,'easycoach.page_templates'));
create policy ec_workspace_page on public.template_metadata as restrictive for select to authenticated,coach_api using(private.ec_page_contains(template_id,'easycoach.page_templates'));
create policy ec_workspace_page on public.exercises as restrictive for select to authenticated,coach_api using(private.ec_page_contains(id,'easycoach.page_exercises'));
create policy ec_workspace_page on public.import_batches as restrictive for select to authenticated,coach_api using(private.ec_page_contains(id,'easycoach.page_imports'));
create function public.ec_workspace_page(target uuid default null,after_client uuid default null,after_template uuid default null,after_exercise uuid default null,search_text text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=private.session_uid(); client_ids uuid[]; template_ids uuid[]; exercise_ids uuid[]; import_ids uuid[]; result jsonb; total integer; begin
 if owner is null then raise exception 'يلزم تسجيل الدخول'; end if;
 -- snapshot() still initializes a missing profile and redirects trainee accounts.
 if not exists(select 1 from public.profiles where id=owner and role='coach') then return private.management_snapshot(); end if;
 if length(coalesce(search_text,''))>120 then raise exception 'نص البحث طويل'; end if;
 select coalesce(array_agg(id order by id),'{}') into client_ids from
 (select id from public.clients where coach_id=owner and (target is null or id=target) and (after_client is null or id>after_client)
 and (target is not null or coalesce(search_text,'')='' or name ilike '%'||search_text||'%' or email ilike '%'||search_text||'%') order by id limit 50) c;
 select coalesce(array_agg(id order by id),'{}') into template_ids from
 (select id from public.templates where coach_id=owner and (after_template is null or id>after_template)
 and (coalesce(search_text,'')='' or name ilike '%'||search_text||'%') order by id limit 100) t;
 select coalesce(array_agg(id order by id),'{}') into exercise_ids from
 (select id from public.exercises where coach_id=owner and (after_exercise is null or id>after_exercise)
 and (coalesce(search_text,'')='' or name ilike '%'||search_text||'%') order by id limit 100) e;
 select coalesce(array_agg(id),'{}') into import_ids from (select id from public.import_batches where coach_id=owner order by created_at desc limit 10) b;
 select count(*) into total from public.clients where coach_id=owner and not archived;
 perform set_config('easycoach.page_clients',client_ids::text,true);
 perform set_config('easycoach.page_templates',template_ids::text,true);
 perform set_config('easycoach.page_exercises',exercise_ids::text,true);
 perform set_config('easycoach.page_imports',import_ids::text,true);
 -- The existing implementation is owned by coach_api, which cannot bypass RLS.
 result:=private.management_snapshot();
 return result||jsonb_build_object('page_info',jsonb_build_object('total_active_clients',total,'client_count',cardinality(client_ids),
 'next_client',case when cardinality(client_ids)=50 and target is null then client_ids[50] end,
 'next_template',case when cardinality(template_ids)=100 then template_ids[100] end,
 'next_exercise',case when cardinality(exercise_ids)=100 then exercise_ids[100] end));
end $$;
revoke all on function private.ec_page_contains(uuid,text),private.ec_page_subscription(uuid) from public,anon,authenticated,coach_api;
grant execute on function private.ec_page_contains(uuid,text),private.ec_page_subscription(uuid) to authenticated,coach_api;
revoke all on function public.ec_workspace_page(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,coach_api;
grant execute on function public.ec_workspace_page(uuid,uuid,uuid,uuid,text) to authenticated;
