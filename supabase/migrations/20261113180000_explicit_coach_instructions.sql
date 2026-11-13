-- Keep legacy library descriptions private to the editor data. Only explicit
-- coachNotes are trainee instructions; do not infer provenance or rewrite plans.
do $$ declare definition text; begin
 select pg_get_functiondef('public.valid_content(jsonb)'::regprocedure) into definition;
 execute replace(definition,'public.valid_content(','private.valid_content_before_coach_notes(');
end $$;
revoke all on function private.valid_content_before_coach_notes(jsonb) from public,anon;
grant execute on function private.valid_content_before_coach_notes(jsonb) to authenticated,coach_api;

create or replace function public.valid_content(body jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare days jsonb:='[]'; d jsonb; e jsonb; exercises jsonb; begin
 if jsonb_typeof(body->'days') is distinct from 'array' then return false; end if;
 for d in select value from jsonb_array_elements(body->'days') loop
  exercises:='[]';
  for e in select value from jsonb_array_elements(d->'exercises') loop
   if e ? 'coachNotes' and (jsonb_typeof(e->'coachNotes') is distinct from 'string' or length(e->>'coachNotes')>2000) then return false; end if;
   exercises:=exercises||jsonb_build_array(e-'coachNotes');
  end loop;
  days:=days||jsonb_build_array(jsonb_set(d,'{exercises}',exercises));
 end loop;
 return private.valid_content_before_coach_notes(jsonb_set(body,'{days}',days));
 exception when others then return false;
end $$;
