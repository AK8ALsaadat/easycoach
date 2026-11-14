-- Preserve accepted contract evidence: export it before removing this feature.
do $$ begin
 if exists(select 1 from public.ec_trial_consents) then
  raise exception 'Trial consent evidence exists; export and settle it before rollback';
 end if;
end $$;
drop function public.ec_start_trial_accepted(text,text);
drop table public.ec_trial_consents;
grant execute on function public.ec_start_trial(text) to authenticated;
