-- A JWT alone does not grant tenant access before email confirmation.
-- Also covers a previously confirmed identity whose confirmation is revoked.
create or replace function private.session_uid() returns uuid
language sql stable security definer set search_path='' as $$
 select u.id from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
$$;

-- Retain exact policy expressions for a reversible, additive migration.
create table private.email_confirmation_policy_backup (
 schema_name text not null, table_name text not null, policy_name text not null,
 old_qual text, old_check text, primary key(schema_name,table_name,policy_name)
);
revoke all on private.email_confirmation_policy_backup from public,anon,authenticated,coach_api;

do $$ declare p record; clause text; begin
 for p in select * from pg_policies where schemaname in ('public','storage')
  and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%') loop
  insert into private.email_confirmation_policy_backup values(p.schemaname,p.tablename,p.policyname,p.qual,p.with_check);
  clause:='';
  if p.qual is not null then clause:=clause||' using ('||replace(p.qual,'auth.uid()','private.session_uid()')||')'; end if;
  if p.with_check is not null then clause:=clause||' with check ('||replace(p.with_check,'auth.uid()','private.session_uid()')||')'; end if;
  execute format('alter policy %I on %I.%I%s',p.policyname,p.schemaname,p.tablename,clause);
 end loop;
end $$;
