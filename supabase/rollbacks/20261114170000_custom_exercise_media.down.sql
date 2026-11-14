-- Drops custom-exercise media and the delete branch.
do $migration$ declare definition text; original text; begin
 select pg_get_functiondef('private.app_command_v1(text,jsonb)'::regprocedure) into definition;
 definition := replace(definition,
  'insert into public.exercises(coach_id,name,description,video,media_id) values(uid,payload->>''name'',coalesce(payload->>''description'',''''),coalesce(payload->>''video'',''''),(select m.id from public.media_assets m where m.id=(payload->>''media_id'')::uuid and m.coach_id=uid and m.status=''ready''))',
  'insert into public.exercises(coach_id,name,description,video) values(uid,payload->>''name'',coalesce(payload->>''description'',''''),coalesce(payload->>''video'',''''))');
 definition := replace(definition,
  'update public.exercises set name=payload->>''name'',description=payload->>''description'',video=payload->>''video'',media_id=case when payload ? ''media_id'' then (select m.id from public.media_assets m where m.id=(payload->>''media_id'')::uuid and m.coach_id=uid and m.status=''ready'') else media_id end where id=(payload->>''id'')::uuid and coach_id=uid',
  'update public.exercises set name=payload->>''name'',description=payload->>''description'',video=payload->>''video'' where id=(payload->>''id'')::uuid and coach_id=uid');
 original := ' when ''exercise_delete'' then' || chr(10) ||
  '  delete from public.exercises where id=(payload->>''id'')::uuid and coach_id=uid returning jsonb_build_object(''id'',id) into result;' || chr(10) ||
  '  if result is null then raise exception ''التمرين غير متاح''; end if;' || chr(10);
 definition := replace(definition, original, '');
 execute definition;
end $migration$;
drop index if exists public.exercises_media_idx;
alter table public.exercises drop column media_id;
