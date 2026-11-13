drop trigger if exists check_program_publish on public.programs;
drop function if exists private.check_program_publish();
drop function if exists private.program_publish_issue(jsonb);
