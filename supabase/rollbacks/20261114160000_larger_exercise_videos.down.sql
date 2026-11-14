-- Back to 50 MB. Any stored asset above the old cap must be removed first.
alter table public.media_assets drop constraint media_assets_size_check;
alter table public.media_assets add constraint media_assets_size_check check(size between 1 and 52428800);
do $$ begin
 -- The local preview database has no storage schema; skip it there.
 if to_regnamespace('storage') is not null then
  execute 'update storage.buckets set file_size_limit=52428800 where id=''coach-videos''';
 end if;
end $$;
