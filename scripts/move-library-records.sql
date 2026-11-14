-- Moves library records (templates, custom exercises, uploaded videos) from one
-- coach account to another. Written for the QA leftovers created on 14 Nov 2026
-- while the browser session had silently become a second account.
--
-- Run it in the Supabase SQL editor, or:
--   psql "$DATABASE_URL" -v source="<uuid>" -v target="<uuid>" -f scripts/move-library-records.sql
--
-- It is deliberately two-phase: the report runs first and changes nothing. Read
-- it, confirm the rows are the ones you expect, then set :move to true.
--
-- Nothing is deleted. A name that already exists on the target account gets a
-- visible suffix instead of overwriting the target's own record, because the
-- unique index on (coach_id, name) would otherwise abort the whole move.

\set ON_ERROR_STOP on
\if :{?move}
\else
  \set move false
\endif

-- 1) Who are these accounts?
select id, name, email, role, created_at
from public.profiles
where id in (:'source'::uuid, :'target'::uuid)
order by created_at;

-- 2) What would move?
select 'template' as kind, t.id, t.name, t.updated_at as at
from public.templates t where t.coach_id = :'source'::uuid
union all
select 'exercise', e.id, e.name, e.created_at from public.exercises e where e.coach_id = :'source'::uuid
union all
select 'media', m.id, m.filename, m.created_at from public.media_assets m where m.coach_id = :'source'::uuid
order by kind, at;

-- 3) Names that would collide on the target account.
select t.id, t.name
from public.templates t
where t.coach_id = :'source'::uuid
  and exists (
    select 1 from public.templates other
    where other.coach_id = :'target'::uuid
      and private.template_name_key(other.name) = private.template_name_key(t.name)
  );

\if :move
begin;

-- Templates: rename on collision, then move. template_metadata follows through
-- its (template_id, coach_id) foreign key, so it is updated in the same step.
update public.templates t
set name = left(btrim(t.name), 52) || ' (منقول)'
where t.coach_id = :'source'::uuid
  and exists (
    select 1 from public.templates other
    where other.coach_id = :'target'::uuid
      and private.template_name_key(other.name) = private.template_name_key(t.name)
  );

alter table public.template_metadata drop constraint template_metadata_template_id_coach_id_fkey;
update public.templates set coach_id = :'target'::uuid where coach_id = :'source'::uuid;
update public.template_metadata set coach_id = :'target'::uuid where coach_id = :'source'::uuid;
alter table public.template_metadata
  add constraint template_metadata_template_id_coach_id_fkey
  foreign key (template_id, coach_id) references public.templates(id, coach_id) on delete cascade;

update public.exercises set coach_id = :'target'::uuid where coach_id = :'source'::uuid;
update public.media_assets set coach_id = :'target'::uuid where coach_id = :'source'::uuid;
-- Expired by design; they carry no content worth moving.
delete from public.upload_sessions where coach_id = :'source'::uuid;

-- 4) Confirm nothing is left behind before committing.
select
  (select count(*) from public.templates where coach_id = :'source'::uuid) as templates_left,
  (select count(*) from public.exercises where coach_id = :'source'::uuid) as exercises_left,
  (select count(*) from public.media_assets where coach_id = :'source'::uuid) as media_left;

commit;
\endif
