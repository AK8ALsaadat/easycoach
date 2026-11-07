-- Tenant lookup indexes and cached identity expressions. No data is changed.
create index if not exists clients_trainee_lookup on public.clients(trainee_user_id) where trainee_user_id is not null and not archived;
create index if not exists programs_latest_lookup on public.programs(client_id,published_at desc,version desc) where published_at is not null;
create index if not exists programs_coach_lookup on public.programs(coach_id);
create index if not exists exercises_coach_lookup on public.exercises(coach_id);
create index if not exists templates_coach_lookup on public.templates(coach_id);
create index if not exists subscriptions_client_lookup on public.subscriptions(client_id,start_date,end_date);
create index if not exists subscriptions_coach_lookup on public.subscriptions(coach_id);
create index if not exists freezes_coach_lookup on public.freezes(coach_id);
create index if not exists payments_coach_lookup on public.payments(coach_id);
create index if not exists invitations_client_lookup on public.invitations(client_id);
create index if not exists invitations_coach_lookup on public.invitations(coach_id);
create index if not exists join_links_coach_lookup on public.join_links(coach_id);
create index if not exists privacy_client_lookup on public.privacy_requests(client_id);
create index if not exists privacy_coach_lookup on public.privacy_requests(coach_id);
create index if not exists audit_coach_time_lookup on public.audit(coach_id,created_at desc);
alter policy profile_self on public.profiles using(id=(select auth.uid()));
alter policy client_read on public.clients using(coach_id=(select auth.uid()) or (trainee_user_id=(select auth.uid()) and not archived));
alter policy client_write on public.clients using(coach_id=(select auth.uid())) with check(coach_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='coach'));
do $$ declare t text; begin
 foreach t in array array['exercises','templates','programs','subscriptions','freezes','payments','invitations','join_links','join_requests','privacy_requests'] loop
  execute format('alter policy coach_own on public.%I using(coach_id=(select auth.uid())) with check(coach_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role=''coach''))',t);
 end loop;
end $$;
