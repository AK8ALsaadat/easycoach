do $$ declare definition text; begin
  select pg_get_functiondef('private.management_command(text,jsonb)'::regprocedure) into definition;
  execute replace(definition, 'return private.mark_messages_read((input_data->>''client_id'')::uuid, input_data->>''side'');', 'return private.mark_messages_read((input_data->>''client_id'')::uuid);');
end $$;
drop function if exists private.mark_messages_read(uuid, text);
