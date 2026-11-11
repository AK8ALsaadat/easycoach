-- Optimistic guards for the editor, retaining legacy/import command compatibility.
alter table public.programs add column edit_revision bigint not null default 1 check(edit_revision>0);
create function private.bump_program_edit_revision() returns trigger language plpgsql set search_path='' as $$ begin
 if new.name is distinct from old.name or new.content is distinct from old.content then
  new.edit_revision:=old.edit_revision+1;
 else new.edit_revision:=old.edit_revision; end if;
 return new;
end $$;
revoke all on function private.bump_program_edit_revision() from public,anon,authenticated;
create trigger bump_program_edit_revision before update of name,content on public.programs
 for each row execute function private.bump_program_edit_revision();

-- Keep the existing checked command owner and all other branches intact.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('private.app_command(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,
  'declare uid uuid:=private.session_uid(); cid uuid; result jsonb; e jsonb;',
  'declare uid uuid:=private.session_uid(); cid uuid; result jsonb; e jsonb; draft public.programs;');
 definition:=replace(definition,
  'if uid is null then raise exception ''يلزم تسجيل الدخول''; end if;',
  $guard$if uid is null then raise exception 'يلزم تسجيل الدخول'; end if;
 if command='program_save' and (payload ? 'expected_draft_id' or payload ? 'expected_edit_revision') then
  if not(payload ?& array['expected_draft_id','expected_edit_revision']) then raise exception 'حدّث الصفحة قبل حفظ المسودة'; end if;
  cid:=(payload->>'client_id')::uuid;
  perform id from public.clients where id=cid and coach_id=uid and not archived for update;
  if not found then raise exception 'العميل غير متاح'; end if;
  select * into draft from public.programs where client_id=cid and coach_id=uid and published_at is null for update;
  -- A response-lost retry with identical content is safe, even with the old revision.
  if draft.id is not null and draft.name=payload->>'name' and draft.content=payload->'content' then return to_jsonb(draft); end if;
  if draft.id is distinct from (payload->>'expected_draft_id')::uuid or draft.edit_revision is distinct from (payload->>'expected_edit_revision')::bigint then
   raise exception 'تغيرت المسودة من نافذة أخرى. احتفظ بتعديلاتك وحدّث الصفحة قبل الحفظ';
  end if;
 elsif command='program_publish' and payload ? 'expected_edit_revision' then
  select client_id into cid from public.programs where id=(payload->>'id')::uuid and coach_id=uid;
  perform id from public.clients where id=cid and coach_id=uid and not archived for update;
  if not found then raise exception 'العميل غير متاح'; end if;
  select * into draft from public.programs where id=(payload->>'id')::uuid and coach_id=uid for update;
  if draft.published_at is not null or draft.edit_revision is distinct from (payload->>'expected_edit_revision')::bigint then
   raise exception 'تغيرت المسودة قبل النشر. راجعها وحدّث الصفحة قبل النشر';
  end if;
 end if;$guard$);
 if position('draft public.programs' in definition)=0 or position('expected_draft_id' in definition)=0 then
  raise exception 'Expected command definition changed; refusing an incomplete migration';
 end if;
 execute definition;
end $migration$;
