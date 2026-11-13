-- Roll back application support first. Existing JSON coachNotes are retained,
-- but editing those plans then requires removing the optional field explicitly.
do $$ declare definition text; begin
 select pg_get_functiondef('private.valid_content_before_coach_notes(jsonb)'::regprocedure) into definition;
 execute replace(definition,'private.valid_content_before_coach_notes(','public.valid_content(');
end $$;
drop function private.valid_content_before_coach_notes(jsonb);
