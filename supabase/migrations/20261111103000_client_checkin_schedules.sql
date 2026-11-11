create table public.client_checkin_schedules (
  client_id uuid primary key references public.clients(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  weight_days integer not null check (weight_days between 1 and 90),
  measurement_days integer not null check (measurement_days between 1 and 180),
  photo_days integer not null check (photo_days between 1 and 180),
  updated_at timestamptz not null default now(),
  unique (client_id, coach_id),
  foreign key (client_id, coach_id) references public.clients(id, coach_id) on delete cascade
);
alter table public.client_checkin_schedules enable row level security;
revoke all on public.client_checkin_schedules from public, anon, authenticated;
grant select, insert, update, delete on public.client_checkin_schedules to coach_api;
create policy client_schedule_coach on public.client_checkin_schedules for all to coach_api using (coach_id = (select private.session_uid())) with check (coach_id = (select private.session_uid()));
create function private.save_client_schedule(input_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.session_uid(); cid uuid:=(input_data->>'client_id')::uuid; result jsonb;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='coach') then raise exception 'هذه العملية للمدرب فقط'; end if;
 if not exists(select 1 from public.clients where id=cid and coach_id=uid and not archived) then raise exception 'المتدرب غير متاح'; end if;
 insert into public.client_checkin_schedules(client_id,coach_id,weight_days,measurement_days,photo_days)
 values(cid,uid,(input_data->>'weight_days')::int,(input_data->>'measurement_days')::int,(input_data->>'photo_days')::int)
 on conflict(client_id) do update set weight_days=excluded.weight_days,measurement_days=excluded.measurement_days,photo_days=excluded.photo_days,updated_at=now()
 returning jsonb_build_object('client_id',client_id,'weight_days',weight_days,'measurement_days',measurement_days,'photo_days',photo_days,'updated_at',updated_at) into result;
 return result;
end $$;
alter function private.save_client_schedule(jsonb) owner to coach_api;
revoke all on function private.save_client_schedule(jsonb) from public,anon,authenticated;
grant execute on function private.save_client_schedule(jsonb) to coach_api;
create function public.client_schedule_save(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.save_client_schedule(payload) $$;
revoke all on function public.client_schedule_save(jsonb) from public,anon;
grant execute on function public.client_schedule_save(jsonb) to authenticated;
grant execute on function private.save_client_schedule(jsonb) to authenticated;
create function public.client_schedules_snapshot() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('client_id',client_id,'weight_days',weight_days,'measurement_days',measurement_days,'photo_days',photo_days) order by client_id),'[]'::jsonb)
 from public.client_checkin_schedules s where s.coach_id=private.session_uid()
 or exists(select 1 from public.clients c where c.id=s.client_id and c.trainee_user_id=private.session_uid() and not c.archived)
$$;
alter function public.client_schedules_snapshot() owner to postgres;
revoke all on function public.client_schedules_snapshot() from public,anon;
grant execute on function public.client_schedules_snapshot() to authenticated;
create function private.portal_schedule_snapshot(token_hash text, proof text) returns jsonb language plpgsql security definer set search_path='' as $$
declare portal_data jsonb; cid uuid;
begin
 portal_data:=private.portal_management(token_hash,proof,'snapshot','{}'::jsonb);
 cid:=(portal_data->>'client_id')::uuid;
 return coalesce((select jsonb_build_object('client_id',client_id,'weight_days',weight_days,'measurement_days',measurement_days,'photo_days',photo_days) from public.client_checkin_schedules where client_id=cid),'null'::jsonb);
end $$;
alter function private.portal_schedule_snapshot(text,text) owner to postgres;
revoke all on function private.portal_schedule_snapshot(text,text) from public,anon,authenticated;
grant execute on function private.portal_schedule_snapshot(text,text) to coach_api;
create function public.portal_schedule_snapshot(token_hash text, proof text) returns jsonb language sql security definer set search_path='' as $$ select private.portal_schedule_snapshot(token_hash,proof) $$;
alter function public.portal_schedule_snapshot(text,text) owner to coach_api;
revoke all on function public.portal_schedule_snapshot(text,text) from public;
grant execute on function public.portal_schedule_snapshot(text,text) to anon,authenticated;
