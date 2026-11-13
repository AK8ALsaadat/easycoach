-- One account can be both a coach and the trainee of its own client. Messages are
-- then authored by the same user on both sides, so "read" must follow the portal
-- that opened them (/me = trainee, /coach = coach) instead of the user id.
create function private.mark_messages_read(cid uuid, side text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := private.session_uid(); c public.clients;
begin
  select * into c from public.clients
    where id = cid and not archived and (coach_id = uid or trainee_user_id = uid);
  if uid is null or c.id is null then raise exception 'العميل غير متاح'; end if;
  -- The requested side is honoured only when the account really holds it.
  if side = 'client' and c.trainee_user_id = uid then
    update public.coaching_records set read_at = now()
      where client_id = cid and kind = 'message' and author_type = 'coach' and read_at is null;
  elsif side = 'coach' and c.coach_id = uid then
    update public.coaching_records set read_at = now()
      where client_id = cid and kind = 'message' and author_type = 'client' and read_at is null;
  else
    update public.coaching_records set read_at = now()
      where client_id = cid and kind = 'message' and author_id is distinct from uid and read_at is null;
  end if;
  return '{}';
end $$;
revoke all on function private.mark_messages_read(uuid, text) from public, anon, authenticated;
grant execute on function private.mark_messages_read(uuid, text) to coach_api;

do $$ declare definition text; original text; begin
  select pg_get_functiondef('private.management_command(text,jsonb)'::regprocedure) into definition;
  original := 'return private.mark_messages_read((input_data->>''client_id'')::uuid);';
  if position(original in definition) = 0 then raise exception 'messages_read branch changed'; end if;
  execute replace(definition, original, 'return private.mark_messages_read((input_data->>''client_id'')::uuid, input_data->>''side'');');
end $$;
