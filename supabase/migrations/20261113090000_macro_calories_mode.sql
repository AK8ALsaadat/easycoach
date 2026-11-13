-- Calories can follow the macros automatically: calories = protein*4 + carbs*4 + fat*9.
-- The coach's auto/manual choice is stored as nutrition.calories_mode next to the
-- targets, so it survives reopening the editor. Legacy rows without the key stay valid.
-- Rollback: supabase/rollbacks/20261113090000_macro_calories_mode.down.sql

create function private.valid_calories_mode(n jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if n is null or jsonb_typeof(n) <> 'object' or not (n ? 'calories_mode') then return true; end if;
 if jsonb_typeof(n->'calories_mode') <> 'string' or n->>'calories_mode' not in ('auto','manual') then return false; end if;
 if n->>'calories_mode' = 'auto' then
  -- Grams allow one decimal, so the exact total may carry a fraction; stored kcal are rounded.
  return abs((n->>'calories')::numeric
   - ((n->>'protein')::numeric*4 + (n->>'carbs')::numeric*4 + (n->>'fat')::numeric*9)) < 1;
 end if;
 return true;
exception when others then return false;
end $$;
revoke all on function private.valid_calories_mode(jsonb) from public,anon;
grant execute on function private.valid_calories_mode(jsonb) to authenticated,coach_api;

-- Keep every existing rule by wrapping the current validator under a private name.
do $$ declare definition text; begin
 select pg_get_functiondef('public.valid_content(jsonb)'::regprocedure) into definition;
 if position('public.valid_content(' in definition)=0 then raise exception 'valid_content definition changed'; end if;
 execute replace(definition,'public.valid_content(','private.valid_content_before_macros(');
end $$;
revoke all on function private.valid_content_before_macros(jsonb) from public,anon;
grant execute on function private.valid_content_before_macros(jsonb) to authenticated,coach_api;

create or replace function public.valid_content(body jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(body) is distinct from 'object' or jsonb_typeof(body->'nutrition') is distinct from 'object' then
  return private.valid_content_before_macros(body);
 end if;
 if not private.valid_calories_mode(body->'nutrition') then return false; end if;
 return private.valid_content_before_macros(jsonb_set(body,'{nutrition}',(body->'nutrition')-'calories_mode'));
exception when others then return false;
end $$;

-- Per-trainee nutrition targets accept the same key.
do $$ declare definition text; original text; begin
 select pg_get_functiondef('private.valid_coaching_record(text,jsonb)'::regprocedure) into definition;
 original:='when ''nutrition_target'' then allowed:=array[''calories'',''protein'',''carbs'',''fat'',''text'',''meals''];';
 if position(original in definition)=0 then raise exception 'nutrition_target validator changed'; end if;
 execute replace(definition,original,
  'when ''nutrition_target'' then allowed:=array[''calories'',''protein'',''carbs'',''fat'',''text'',''meals'',''calories_mode''];');
end $$;
alter table public.coaching_records add constraint nutrition_target_calories_mode
 check (kind<>'nutrition_target' or private.valid_calories_mode(payload));
