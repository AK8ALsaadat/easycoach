-- Restores the dated campaign window from 20261116100000.
update public.ec_config set trial_end='2026-12-31 20:59:59+00'::timestamptz where trial_enabled;
