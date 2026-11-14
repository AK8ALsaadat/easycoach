-- The free-trial offer stays open until the operator closes it explicitly
-- (ec_config requires a non-null end, so a far-future sentinel is used).
-- To close the offer: update public.ec_config set trial_end=now();
-- Each trial is still exactly 14 days (336 hours) from the moment it starts.
update public.ec_config set trial_enabled=true,
 trial_start=coalesce(trial_start,now()),
 trial_end='2099-12-31 20:59:59+00'::timestamptz;
