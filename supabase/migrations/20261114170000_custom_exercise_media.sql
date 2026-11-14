-- "My exercises" could only hold a pasted https link: no upload, no delete, and
-- nothing carried into a program when the exercise was added by name. A custom
-- exercise now owns an uploaded clip the same way a program row does, and can
-- be removed.
-- Rollback: supabase/rollbacks/20261114170000_custom_exercise_media.down.sql

alter table public.exercises add column media_id uuid references public.media_assets(id) on delete set null;
create index exercises_media_idx on public.exercises(media_id) where media_id is not null;

do $migration$ declare definition text; original text; begin
 select pg_get_functiondef('private.app_command_v1(text,jsonb)'::regprocedure) into definition;

 -- Carry media_id on insert and update, and only ever a clip this coach owns.
 original := 'insert into public.exercises(coach_id,name,description,video) values(uid,payload->>''name'',coalesce(payload->>''description'',''''),coalesce(payload->>''video'',''''))';
 if position(original in definition) = 0 then raise exception 'exercise_save insert changed'; end if;
 definition := replace(definition, original,
  'insert into public.exercises(coach_id,name,description,video,media_id) values(uid,payload->>''name'',coalesce(payload->>''description'',''''),coalesce(payload->>''video'',''''),(select m.id from public.media_assets m where m.id=(payload->>''media_id'')::uuid and m.coach_id=uid and m.status=''ready''))');

 original := 'update public.exercises set name=payload->>''name'',description=payload->>''description'',video=payload->>''video'' where id=(payload->>''id'')::uuid and coach_id=uid';
 if position(original in definition) = 0 then raise exception 'exercise_save update changed'; end if;
 definition := replace(definition, original,
  'update public.exercises set name=payload->>''name'',description=payload->>''description'',video=payload->>''video'',media_id=case when payload ? ''media_id'' then (select m.id from public.media_assets m where m.id=(payload->>''media_id'')::uuid and m.coach_id=uid and m.status=''ready'') else media_id end where id=(payload->>''id'')::uuid and coach_id=uid');

 -- Deleting a custom exercise never touches programs already built from it:
 -- a program row keeps its own copy of the name, notes, link and clip.
 original := ' when ''exercise_save'' then';
 if position(original in definition) = 0 then raise exception 'exercise_save branch changed'; end if;
 definition := replace(definition, original,
  ' when ''exercise_delete'' then' || chr(10) ||
  '  delete from public.exercises where id=(payload->>''id'')::uuid and coach_id=uid returning jsonb_build_object(''id'',id) into result;' || chr(10) ||
  '  if result is null then raise exception ''التمرين غير متاح''; end if;' || chr(10) ||
  original);

 execute definition;
end $migration$;
