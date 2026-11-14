-- Scoped team editing, portal color and complete operational pagination.
alter table public.ec_accounts add column portal_color text check(portal_color ~ '^#[0-9a-fA-F]{6}$');
create function public.ec_brand_color(color text) returns boolean language plpgsql security definer set search_path='' as $$ begin
 perform private.ec_assert(private.session_uid(),'branding');
 if color is null or color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'اختر لونًا صالحًا'; end if;
 update public.ec_accounts set portal_color=lower(color) where owner_id=private.session_uid();
 if not found then raise exception 'غير مسموح'; end if; return true;
end $$;
create function public.ec_client_color(client uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare owner uuid; begin
 select coach_id into owner from public.clients where id=client and not archived and (coach_id=private.session_uid() or trainee_user_id=private.session_uid());
 if owner is null then raise exception 'غير مسموح'; end if;
 if not private.ec_has(owner,'branding') then return null; end if;
 return (select portal_color from public.ec_accounts where owner_id=owner);
end $$;
do $$ declare def text; marker text; begin
 select pg_get_functiondef('private.portal_access(text,text,date,numeric,boolean)'::regprocedure) into def;
 marker:='''session_packages'',private.ec_package_summary(target)';
 if position(marker in def)=0 then raise exception 'Portal projection changed'; end if;
 execute replace(def,marker,marker||',''portal_color'',case when private.ec_has(owner,''branding'') then (select portal_color from public.ec_accounts where owner_id=owner) end');
end $$;

create function public.ec_team_program_context(owner uuid,target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform private.ec_assert(owner,'team');perform private.ec_assert(owner,'programs');
 if not private.ec_scope(owner,target) then raise exception 'البرنامج خارج نطاق صلاحياتك'; end if;
 return jsonb_build_object('client',(select jsonb_build_object('id',id,'name',name) from public.clients where id=target),
 'draft',(select to_jsonb(p) from public.programs p where coach_id=owner and client_id=target and published_at is null),
 'published',(select to_jsonb(p) from public.programs p where coach_id=owner and client_id=target and published_at is not null order by published_at desc,version desc limit 1),
 'library',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'video',video,'media_id',media_id)) from public.exercises where coach_id=owner),'[]'));
end $$;
create function public.ec_team_program_save(owner uuid,target uuid,program_name text,body jsonb,expected_id uuid,expected_revision bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare draft public.programs; result public.programs; exercise jsonb; nutrition jsonb; begin
 perform private.ec_assert(owner,'team');perform private.ec_assert(owner,'programs');
 perform id from public.clients where id=target and coach_id=owner and not archived for update;
 if not found or not private.ec_scope(owner,target) then raise exception 'البرنامج خارج نطاق صلاحياتك'; end if;
 if program_name is null or length(trim(program_name)) not between 2 and 140 or body is null or octet_length(body::text)>1048576 or not public.valid_content(body) then raise exception 'بيانات البرنامج غير صالحة'; end if;
 for exercise in select e from jsonb_array_elements(body->'days') d cross join lateral jsonb_array_elements(d->'exercises') e loop
  if exercise ? 'mediaId' and not exists(select 1 from public.media_assets where id=(exercise->>'mediaId')::uuid and coach_id=owner and status='ready') then raise exception 'الفيديو لا يتبع المنشأة أو غير جاهز'; end if;
 end loop;
 select payload into nutrition from public.coaching_records where coach_id=owner and client_id=target and kind='nutrition_target' and entry_date<=(now() at time zone 'Asia/Riyadh')::date order by entry_date desc,created_at desc limit 1;
 if nutrition is not null then body:=jsonb_set(body,'{nutrition}',nutrition); end if;
 select * into draft from public.programs where client_id=target and coach_id=owner and published_at is null for update;
 if draft.id is not null and draft.name=trim(program_name) and draft.content=body then return to_jsonb(draft); end if;
 if draft.id is distinct from expected_id or draft.edit_revision is distinct from expected_revision then raise exception 'تغيرت المسودة من نافذة أخرى. احتفظ بتعديلاتك وحدّث الصفحة'; end if;
 if draft.id is null then
  insert into public.programs(coach_id,client_id,name,content) values(owner,target,trim(program_name),body) returning * into result;
 else
  update public.programs set name=trim(program_name),content=body where id=draft.id returning * into result;
 end if;
 insert into public.ec_team_audit(owner_id,actor_id,action,entity_id) values(owner,private.session_uid(),'team_program_save',result.id);
 return to_jsonb(result);
end $$;
create function public.ec_team_program_publish(owner uuid,program uuid,expected_revision bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare draft public.programs; target uuid; nutrition jsonb; begin
 perform private.ec_assert(owner,'team');perform private.ec_assert(owner,'programs');
 select client_id into target from public.programs where id=program and coach_id=owner;
 perform id from public.clients where id=target and coach_id=owner and not archived for update;
 if not found or not private.ec_scope(owner,target) then raise exception 'البرنامج خارج نطاق صلاحياتك'; end if;
 select * into draft from public.programs where id=program and coach_id=owner for update;
 if draft.published_at is not null then return to_jsonb(draft); end if;
 if draft.edit_revision is distinct from expected_revision then raise exception 'تغيرت المسودة قبل النشر'; end if;
 select payload into nutrition from public.coaching_records where coach_id=owner and client_id=target and kind='nutrition_target' and entry_date<=(now() at time zone 'Asia/Riyadh')::date order by entry_date desc,created_at desc limit 1;
 if nutrition is not null and draft.content->'nutrition' is distinct from nutrition then
  update public.programs set content=jsonb_set(content,'{nutrition}',nutrition) where id=program returning * into draft;
 end if;
 -- Existing publication triggers validate real exercises, meals and immutable snapshots.
 update public.programs set published_at=clock_timestamp() where id=program returning * into draft;
 insert into public.ec_team_audit(owner_id,actor_id,action,entity_id) values(owner,private.session_uid(),'team_program_publish',program);
 return to_jsonb(draft);
end $$;

create function public.ec_task_page(owner uuid,after_due timestamptz default null,after_id uuid default null,task_status text default 'open') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 perform private.ec_assert(owner,'tasks');
 if task_status not in ('open','done') then raise exception 'حالة غير صالحة'; end if;
 if owner is distinct from private.session_uid() and not exists(select 1 from public.ec_team where owner_id=owner and member_id=private.session_uid() and active and accepted_at is not null) then raise exception 'غير مسموح'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.due_at,t.id),'[]') into result from
 (select * from public.ec_tasks where owner_id=owner and status=task_status and private.ec_scope(owner,client_id)
 and (after_due is null or (due_at,id)>(after_due,after_id)) order by due_at,id limit 100) t;
 return result;
end $$;
-- Owner is a real comparison bucket: unassigned clients belong to the owner.
do $$ declare def text; begin
 select pg_get_functiondef('public.ec_report(uuid,uuid,uuid)'::regprocedure) into def;
 execute replace(def,'(member is null or a.member_id=member)','(member is null or a.member_id=member or (member=owner and a.member_id is null))');
end $$;
create function public.ec_coach_comparison(owner uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform private.ec_assert(owner,'branches');
 if owner is distinct from private.session_uid() then raise exception 'المقارنة للمالك فقط'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'report',public.ec_report(owner,null,p.id)) order by p.id),'[]')
 from public.profiles p where p.id=owner or exists(select 1 from public.ec_team m where m.owner_id=owner and m.member_id=p.id and m.active and m.accepted_at is not null));
end $$;
-- Enqueue Starter expiry reminders in bounded, restartable batches; delivery stays disabled.
create function public.ec_queue_package_expiry() returns integer language plpgsql security definer set search_path='' as $$
declare inserted integer; begin
 insert into public.ec_email_outbox(owner_id,kind,period_ref,payload)
 select s.coach_id,'package_expiry:'||s.id,s.end_date::timestamp at time zone 'Asia/Riyadh',
 jsonb_build_object('client_id',s.client_id,'subscription_id',s.id,'end_date',s.end_date)
 from public.subscriptions s join public.clients c on c.id=s.client_id
 where not c.archived and private.ec_has(s.coach_id,'expiry_email')
 and s.end_date between (now() at time zone 'Asia/Riyadh')::date and (now() at time zone 'Asia/Riyadh')::date+3
 and not exists(select 1 from public.ec_email_outbox o where o.owner_id=s.coach_id and o.kind='package_expiry:'||s.id and o.period_ref=s.end_date::timestamp at time zone 'Asia/Riyadh')
 order by s.end_date,s.id limit 500 on conflict do nothing;
 get diagnostics inserted=row_count;return inserted;
end $$;
create index ec_package_expiry on public.subscriptions(end_date,id,coach_id);
-- A persisted mutation serial makes concurrent Repeatable Read writers conflict,
-- rather than letting an old snapshot pass a count after an unchanged parent lock.
alter table public.ec_accounts add column quota_revision bigint not null default 0;
do $$ declare def text; begin
 select pg_get_functiondef('private.ec_guard_resource()'::regprocedure) into def;
 execute replace(def,'select * into a from public.ec_accounts where owner_id=new.coach_id for update;',
 'update public.ec_accounts set quota_revision=quota_revision+1 where owner_id=new.coach_id returning * into a;');
 select pg_get_functiondef('public.ec_team_invite(text,text,uuid)'::regprocedure) into def;
 execute replace(def,'perform 1 from public.ec_accounts where owner_id=owner for update;',
 'update public.ec_accounts set quota_revision=quota_revision+1 where owner_id=owner;');
 select pg_get_functiondef('private.ec_guard_template_metadata()'::regprocedure) into def;
 execute replace(def,'perform 1 from public.ec_accounts where owner_id=new.coach_id for update;',
 'update public.ec_accounts set quota_revision=quota_revision+1 where owner_id=new.coach_id;');
 select pg_get_functiondef('private.media_access(uuid,text,text)'::regprocedure) into def;
 execute replace(def,'if m.coach_id=private.session_uid() then return to_jsonb(m); end if;',
 'if m.coach_id=private.session_uid() then return to_jsonb(m); end if;
 if m.status=''ready'' and private.ec_has(m.coach_id,''team'') and exists(select 1 from public.clients c where c.coach_id=m.coach_id and private.ec_scope(m.coach_id,c.id)) then return to_jsonb(m)-''coach_id''; end if;');
 select pg_get_functiondef('private.ec_guard_client_data()'::regprocedure) into def;
 execute replace(def,'begin',
 'begin
 if tg_op=''UPDATE'' and tg_table_name=''portal_links'' and rowdata->>''revoked_at'' is not null and rowdata-''revoked_at''=to_jsonb(old)-''revoked_at'' then return new; end if;');
end $$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('ec_brand_color','ec_client_color','ec_team_program_context','ec_team_program_save','ec_team_program_publish','ec_task_page','ec_coach_comparison') loop
 execute format('revoke all on function %s from public,anon,authenticated,coach_api',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
revoke all on function public.ec_queue_package_expiry() from public,anon,authenticated,coach_api;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.ec_queue_package_expiry() to service_role; end if;end $$;
