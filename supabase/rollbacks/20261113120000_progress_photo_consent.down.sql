-- Reverses 20261113120000_progress_photo_consent.sql (consent history is lost).
-- Run manually, then remove the migration row.
do $$ declare definition text; begin
 select pg_get_functiondef('private.photo_command(text,jsonb)'::regprocedure) into definition;
 execute replace(definition, chr(10) || '      if not private.photo_consent_active(c.id) then raise exception ''رفع الصور يحتاج موافقة المتدرب على إشعار صور التقدم''; end if;', '');
 select pg_get_functiondef('private.portal_management(text,text,text,jsonb)'::regprocedure) into definition;
 execute replace(definition, chr(10) || '  if not private.photo_consent_active(cid) then raise exception ''رفع الصور يحتاج موافقة المتدرب على إشعار صور التقدم''; end if;', '');
end $$;
drop function if exists public.portal_photo_consent(text, text);
drop function if exists public.photo_consent_snapshot();
drop function if exists public.photo_consent(text, uuid, integer, boolean, text, text);
drop function if exists private.photo_consent_state(uuid);
drop function if exists private.photo_consent_active(uuid);
drop function if exists private.photo_consent_version();
drop table if exists public.client_consents;
