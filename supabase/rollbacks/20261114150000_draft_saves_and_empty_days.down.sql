-- Restores the publish check without the empty-day rule.
create or replace function private.program_publish_issue(content jsonb) returns text
language sql immutable set search_path='' as $$
  select case
    when exists (
      select 1 from jsonb_array_elements(coalesce(content->'days', '[]'::jsonb)) d,
        jsonb_array_elements(coalesce(d->'exercises', '[]'::jsonb)) e
      where btrim(e->>'name') = 'تمرين جديد'
    ) then 'سمِّ كل التمارين قبل النشر؛ ما زال فيه تمرين باسم «تمرين جديد».'
    when exists (
      select 1 from jsonb_array_elements(coalesce(content->'nutrition'->'meals', '[]'::jsonb)) m
      where btrim(coalesce(m->>'foods', '')) = ''
        and coalesce((m->>'calories')::numeric, 0) = 0 and coalesce((m->>'protein')::numeric, 0) = 0
        and coalesce((m->>'carbs')::numeric, 0) = 0 and coalesce((m->>'fat')::numeric, 0) = 0
    ) then 'أكمل الوجبات قبل النشر؛ فيه وجبة فارغة وكل قيمها صفر.'
  end $$;
revoke all on function private.program_publish_issue(jsonb) from public, anon, authenticated;

-- Restores "every day needs at least one exercise" at the row level.
do $$ declare definition text; original text; begin
 select pg_get_functiondef('private.valid_content_v1(jsonb)'::regprocedure) into definition;
 original := 'jsonb_array_length(d->''exercises'') not between 0 and 40';
 if position(original in definition) = 0 then raise exception 'valid_content_v1 day rule changed'; end if;
 execute replace(definition, original, 'jsonb_array_length(d->''exercises'') not between 1 and 40');
end $$;
