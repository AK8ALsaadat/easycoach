-- The staging table exists only inside import transactions. Use parameterized
-- dynamic statements so static validation does not require a persistent table.
do $$ declare definition text; begin
 select pg_get_functiondef('private.import_management(jsonb)'::regprocedure) into definition;
 definition:=regexp_replace(definition,$pattern$insert into pg_temp.management_import_changes\(change\) values\(([^\n]*)\);$pattern$,$replacement$execute 'insert into pg_temp.management_import_changes(change) values($1)' using \1;$replacement$,'gn');
 definition:=replace(definition,
 $old$select coalesce(jsonb_agg(change order by position),'[]'::jsonb) into changes from pg_temp.management_import_changes;$old$,
 $new$execute 'select coalesce(jsonb_agg(change order by position),''[]''::jsonb) from pg_temp.management_import_changes' into changes;$new$);
 execute definition;
end $$;
