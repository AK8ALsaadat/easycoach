-- Coach notes stay private even when a trainee queries the Data API directly.
revoke select on public.client_goals from authenticated;
grant select(client_id,coach_id,goal,target_weight,focus,updated_at) on public.client_goals to authenticated;
create or replace function private.studio_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 return public.app_snapshot()||jsonb_build_object(
 'weights',coalesce((select jsonb_agg(w order by entry_date) from public.weight_entries w),'[]'),
 'client_goals',coalesce((select jsonb_agg(to_jsonb(g)-case when g.coach_id=private.session_uid() then array[]::text[] else array['notes'] end) from public.client_goals g),'[]'),
 'media_assets',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'filename',m.filename,'size',m.size,'status',m.status,'created_at',m.created_at)) from public.media_assets m),'[]'),
 'portal_links',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'client_id',l.client_id,'revoked_at',l.revoked_at,'expires_at',l.expires_at,'last_opened_at',l.last_opened_at)) from public.portal_links l),'[]'));
end $$;
-- Use the same persisted PIN throttle for media authorization. Return NULL on
-- invalid proof so failed-attempt updates commit instead of rolling back.
do $$ declare definition text; begin
 select pg_get_functiondef('private.media_access(uuid,text,text)'::regprocedure) into definition;
 execute replace(definition,'if portal_hash is not null then','if portal_hash is not null then if private.portal_access(portal_hash,proof) ? ''error'' then return null; end if;');
end $$;
