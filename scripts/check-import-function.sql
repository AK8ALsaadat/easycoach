begin;
create extension if not exists plpgsql_check with schema extensions;
create temporary table management_import_changes(position bigint,change jsonb) on commit drop;
do $$ begin
 if exists(select 1 from extensions.plpgsql_check_function_tb('private.import_management(jsonb)'::regprocedure) where level='error') then raise exception 'Import function static validation failed'; end if;
end $$;
rollback;
select true as import_function_checked_in_rolled_back_transaction;
