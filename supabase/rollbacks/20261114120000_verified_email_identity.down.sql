do $$ declare p record; clause text; begin
 for p in select * from private.email_confirmation_policy_backup loop
  clause:='';
  if p.old_qual is not null then clause:=clause||' using ('||p.old_qual||')'; end if;
  if p.old_check is not null then clause:=clause||' with check ('||p.old_check||')'; end if;
  execute format('alter policy %I on %I.%I%s',p.policy_name,p.schema_name,p.table_name,clause);
 end loop;
end $$;
drop table private.email_confirmation_policy_backup;
create or replace function private.session_uid() returns uuid
language sql stable security definer set search_path='' as $$ select auth.uid() $$;
