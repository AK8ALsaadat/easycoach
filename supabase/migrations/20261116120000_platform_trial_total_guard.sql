-- The card-less trial migration relaxed the active/trial total requirement.
-- Restore the independent non-negative amount constraint it also matched.
alter table public.ec_accounts
 add constraint ec_accounts_trial_total_nonnegative check (locked_total_halalas >= 0);
