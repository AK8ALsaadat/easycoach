-- A draft is work in progress: it must always be saveable. Only publishing is
-- blocked, and the message has to name what is wrong.
--
-- A day with no exercises was previously impossible to save at all (the save
-- schema required at least one exercise per day), so it was never checked at
-- publish time either. Now that drafts accept it, publish must reject it.
-- Rollback: supabase/rollbacks/20261114150000_draft_saves_and_empty_days.down.sql

create or replace function private.program_publish_issue(content jsonb) returns text
language sql immutable set search_path='' as $$
  select case
    when exists (
      select 1 from jsonb_array_elements(coalesce(content->'days', '[]'::jsonb)) d
      where jsonb_array_length(coalesce(d->'exercises', '[]'::jsonb)) = 0
    ) then 'ما تنشر برنامجًا فيه يوم فاضي: ' || (
      select string_agg(coalesce(nullif(btrim(d->>'name'), ''), 'يوم بدون اسم'), '، ')
      from jsonb_array_elements(coalesce(content->'days', '[]'::jsonb)) d
      where jsonb_array_length(coalesce(d->'exercises', '[]'::jsonb)) = 0
    ) || '. أضف تمرينًا أو احذف اليوم.'
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

-- The row constraint behind both templates and programs refused a day with no
-- exercises, so no draft containing one could be stored at all. Drafts now
-- accept it (publishing does not), edited through pg_get_functiondef so the
-- rest of the validator keeps whatever shape later migrations gave it.
do $$ declare definition text; original text; begin
 select pg_get_functiondef('private.valid_content_v1(jsonb)'::regprocedure) into definition;
 original := 'jsonb_array_length(d->''exercises'') not between 1 and 40';
 if position(original in definition) = 0 then raise exception 'valid_content_v1 day rule changed'; end if;
 execute replace(definition, original, 'jsonb_array_length(d->''exercises'') not between 0 and 40');
end $$;
