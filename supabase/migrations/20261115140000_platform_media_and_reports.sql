create index ec_active_client_page on public.clients(coach_id,id) where not archived;
create index ec_template_page on public.templates(coach_id,id);
-- Preserve existing function bodies so the full rollout can be rolled back safely.
do $$ declare f regprocedure; def text; marker text; addition text; begin
 foreach f in array array['private.media_access(uuid,text,text)'::regprocedure,'private.photo_access(uuid,text,text)'::regprocedure,
 'private.coach_identity(uuid)'::regprocedure,'public.coach_branding_avatar(uuid)'::regprocedure] loop
 select pg_get_functiondef(f) into def;
 insert into private.ec_rpc_backup values(f::text,def);
 if f='private.media_access(uuid,text,text)'::regprocedure then
  marker:='select * into m from public.media_assets where id=asset;';
  addition:=marker||' if not private.ec_has(m.coach_id,''exercises'') then return null; end if;';
 elsif f='private.photo_access(uuid,text,text)'::regprocedure then
  marker:='select * into p from public.progress_photos where id=asset;';
  addition:=marker||' if not private.ec_has(p.coach_id,''measurements'') then return null; end if;';
 else continue;
 end if;
 if position(marker in def)=0 then raise exception 'Expected media guard marker was not found'; end if;
 execute replace(def,marker,addition);
 end loop;
end $$;
create or replace function private.coach_identity(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('coach_id',p.id,
 'name',case when private.ec_has(p.id,'branding') then coalesce(nullif(b.display_name,''),p.name) else p.name end,
 'display_name',case when private.ec_has(p.id,'branding') then coalesce(b.display_name,'') else '' end,
 'avatar_id',case when private.ec_has(p.id,'branding') then b.avatar_id end,'updated_at',b.updated_at)
 from public.profiles p left join public.coach_branding b on b.coach_id=p.id where p.id=target and p.role='coach'
$$;
create or replace function public.coach_branding_avatar(asset uuid) returns text language sql stable security definer set search_path='' as $$
 select avatar_base64 from public.coach_branding where avatar_id=asset and private.ec_has(coach_id,'branding')
$$;
-- Portal workout logs are filtered on downgrade too, despite their definer reader.
do $$ declare def text; marker text; begin
 select pg_get_functiondef('private.portal_management(text,text,text,jsonb)'::regprocedure) into def;
 marker:='return private.portal_management_before_ec(token_hash,proof,command,input_data);';
 execute replace(def,marker,$replacement$
 data:=private.portal_management_before_ec(token_hash,proof,command,input_data);
 if not private.ec_has(owner,'workout_logs') then
  data:=jsonb_set(data,'{management,records}',coalesce((select jsonb_agg(r) from jsonb_array_elements(data->'management'->'records') r where r->>'kind'<>'workout_log'),'[]'));
 end if;
 return data;
 $replacement$);
end $$;
create function public.ec_advanced_report(owner uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 perform private.ec_assert(owner,'reports_advanced');
 if owner<>private.session_uid() then raise exception 'تقرير تقدم المنشأة للمالك فقط'; end if;
 select jsonb_build_object(
  'completed_workouts',(select count(*) from public.coaching_records where coach_id=owner and kind='workout_log' and (payload->>'completed')::boolean),
  'recorded_workouts',(select count(*) from public.coaching_records where coach_id=owner and kind='workout_log'),
  'expiring_packages',(select count(*) from public.subscriptions where coach_id=owner and end_date between (now() at time zone 'Asia/Riyadh')::date and (now() at time zone 'Asia/Riyadh')::date+7),
  'inactive_clients',(select count(*) from public.clients c where c.coach_id=owner and not c.archived and greatest(c.created_at,
    (select max(created_at) from public.session_attendance where client_id=c.id),
    (select max(created_at) from public.coaching_records where client_id=c.id and kind='workout_log'))<now()-interval '14 days'),
  'weight_records',(select count(*) from public.weight_entries where coach_id=owner),
  'measurements',(select count(*) from public.coaching_records where coach_id=owner and kind='measurement')) into result;
 return result;
end $$;
create function public.ec_comparison(owner uuid,after_branch uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 perform private.ec_assert(owner,'branches');
 if owner<>private.session_uid() then raise exception 'مقارنة الفروع للمالك فقط'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'report',public.ec_report(owner,b.id)) order by b.id),'[]') into result
 from (select id,name from public.ec_branches where owner_id=owner and active and (after_branch is null or id>after_branch) order by id limit 50) b;
 return result;
end $$;
revoke all on function public.ec_advanced_report(uuid),public.ec_comparison(uuid,uuid) from public,anon,authenticated,coach_api;
grant execute on function public.ec_advanced_report(uuid),public.ec_comparison(uuid,uuid) to authenticated;
