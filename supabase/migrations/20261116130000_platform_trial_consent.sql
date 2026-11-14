-- The application reviews a selected plan and records a versioned acceptance
-- atomically with trial creation. No card or payment is created here.
create table public.ec_trial_consents (
 owner_id uuid primary key references public.ec_accounts(owner_id) on delete cascade,
 plan text not null references public.ec_plans(code) check(plan <> 'free'),
 policy_version text not null,
 accepted_at timestamptz not null default now(),
 quote jsonb not null
);
alter table public.ec_trial_consents enable row level security;
revoke all on public.ec_trial_consents from public,anon,authenticated;
grant select on public.ec_trial_consents to authenticated;
create policy ec_trial_consents_owner_read on public.ec_trial_consents for select to authenticated
 using(owner_id=(select private.session_uid()));

create function public.ec_start_trial_accepted(plan_code text,accepted_version text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare owner uuid; offer jsonb; result jsonb; begin
 if accepted_version is distinct from '2026-11-14' then
  raise exception 'اقرأ الشروط وسياسة الخصوصية ووافق على النسخة الحالية قبل بدء التجربة';
 end if;
 if plan_code is null or plan_code not in ('starter','pro','business') then raise exception 'اختر باقة مدفوعة لبدء التجربة'; end if;
 select owner_id into owner from public.ec_accounts where owner_id=private.session_uid() for update;
 if owner is null then raise exception 'التجربة المجانية لمالك حساب مدرب' using errcode='P0403'; end if;
 offer:=public.ec_quote(plan_code);
 result:=public.ec_start_trial(plan_code);
 insert into public.ec_trial_consents(owner_id,plan,policy_version,quote)
 values(owner,plan_code,accepted_version,offer);
 return result;
end $$;
revoke all on function public.ec_start_trial_accepted(text,text) from public,anon,authenticated,coach_api;
grant execute on function public.ec_start_trial_accepted(text,text) to authenticated;
-- Existing clients must use the reviewed, versioned entry point too.
revoke execute on function public.ec_start_trial(text) from authenticated;
