alter function private.valid_coaching_record(text,jsonb) rename to valid_coaching_record_before_sets;
create function private.valid_coaching_record(kind text,body jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare e jsonb; s jsonb; clean jsonb := body; rows jsonb := '[]';
begin
 if kind='workout_log' and body ? 'exercises' then
  for e in select value from jsonb_array_elements(body->'exercises') loop
   if e ? 'set_logs' then
    if jsonb_typeof(e->'set_logs') is distinct from 'array' or jsonb_array_length(e->'set_logs') not between 1 and 20 or jsonb_array_length(e->'set_logs')<>(e->>'sets')::integer then return false; end if;
    for s in select value from jsonb_array_elements(e->'set_logs') loop
     if jsonb_typeof(s) is distinct from 'object' or s-array['reps','weight']<>'{}'::jsonb or jsonb_typeof(s->'reps') is distinct from 'number' or (s->>'reps')::numeric not between 1 and 100 or (s->>'reps')::numeric<>trunc((s->>'reps')::numeric) then return false; end if;
     if s ? 'weight' and (jsonb_typeof(s->'weight') is distinct from 'number' or (s->>'weight')::numeric not between 0 and 1500) then return false; end if;
    end loop;
   end if;
   rows:=rows||jsonb_build_array(e-'set_logs');
  end loop;
  clean:=jsonb_set(body,'{exercises}',rows);
 end if;
 return private.valid_coaching_record_before_sets(kind,clean);
exception when others then return false;
end $$;
revoke all on function private.valid_coaching_record(text,jsonb) from public,anon;
grant execute on function private.valid_coaching_record(text,jsonb) to authenticated,coach_api;
-- CHECK expressions bind the original function OID; explicitly bind the wrapper.
alter table public.coaching_records drop constraint coaching_payload_valid;
alter table public.coaching_records add constraint coaching_payload_valid check(private.valid_coaching_record(kind,payload));
