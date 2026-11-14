-- The identity column is an internal row ordering key shared by all coaches.
-- A trainee-facing revision counts publications for that trainee only.
alter table public.programs add column publication_number bigint;
-- Only the derived counter changes. The existing immutable-snapshot trigger
-- rejects every update of a published row, including this metadata backfill.
-- ALTER TABLE holds the lock; this trigger is restored within the transaction.
alter table public.programs disable trigger published_snapshot;
with numbered as (
 select id,row_number() over(partition by client_id order by published_at,version) as n
 from public.programs where published_at is not null
)
update public.programs p set publication_number=n.n from numbered n where n.id=p.id;
alter table public.programs enable trigger published_snapshot;
create unique index programs_publication_number on public.programs(client_id,publication_number) where publication_number is not null;
create function private.number_program_publication() returns trigger language plpgsql set search_path='' as $$
begin
 if new.published_at is not null and (tg_op='INSERT' or old.published_at is null) then
  perform 1 from public.clients where id=new.client_id for update;
  select coalesce(max(publication_number),0)+1 into new.publication_number from public.programs where client_id=new.client_id;
 elsif tg_op='UPDATE' then
  new.publication_number:=old.publication_number;
 else
  new.publication_number:=null;
 end if;
 return new;
end $$;
revoke all on function private.number_program_publication() from public,anon,authenticated;
create trigger number_program_publication before insert or update on public.programs for each row execute function private.number_program_publication();
