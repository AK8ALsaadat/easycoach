-- Coaches record exercise clips on their phones, where a 60-second portrait
-- video routinely passes 50 MB. The cap moves to 200 MB in the three places
-- that enforce it: the row check, the storage bucket, and the API schema
-- (app/studio-actions.ts).
-- Rollback: supabase/rollbacks/20261114160000_larger_exercise_videos.down.sql

alter table public.media_assets drop constraint media_assets_size_check;
alter table public.media_assets add constraint media_assets_size_check check(size between 1 and 209715200);

do $$ begin
 -- The local preview database has no storage schema; skip it there.
 if to_regnamespace('storage') is not null then
  execute 'update storage.buckets set file_size_limit=209715200 where id=''coach-videos''';
 end if;
end $$;
