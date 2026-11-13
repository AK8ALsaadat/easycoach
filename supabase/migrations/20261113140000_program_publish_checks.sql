-- Block publishing a program that still contains a default exercise name or an
-- empty placeholder meal (no foods and every value zero). Enforced on the row so
-- every publish path (editor, template assignment, management) is covered.
create function private.program_publish_issue(content jsonb) returns text
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

create function private.check_program_publish() returns trigger
language plpgsql security definer set search_path='' as $$
declare issue text;
begin
  if old.published_at is null and new.published_at is not null then
    issue := private.program_publish_issue(new.content);
    if issue is not null then raise exception '%', issue; end if;
  end if;
  return new;
end $$;
revoke all on function private.check_program_publish() from public, anon, authenticated;

create trigger check_program_publish before update of published_at on public.programs
  for each row execute function private.check_program_publish();
