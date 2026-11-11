-- Keep existing photos visible as unclassified while giving new uploads a
-- consistent angle and a recorded consent attestation.
alter table public.progress_photos
  add column angle text not null default 'unspecified'
    check (angle in ('front', 'back', 'side', 'unspecified')),
  add column consented_at timestamptz,
  add column consent_source text
    check (consent_source in ('trainee', 'coach_attestation'));

create index photo_client_angle_date
  on public.progress_photos(client_id, angle, entry_date desc, created_at desc)
  where status = 'ready';

-- A stalled upload stays retryable for a day, then the next coach cleanup pass
-- removes its metadata and queues the private object for storage deletion.
create or replace function private.photo_cleanup(completed jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := private.session_uid(); result jsonb;
begin
  if uid is null or not exists(select 1 from public.profiles where id=uid and role='coach') then
    raise exception 'Coach access required';
  end if;
  delete from private.progress_photo_deletions
    where coach_id=uid
      and id in (select value::uuid from jsonb_array_elements_text(coalesce(completed,'[]'::jsonb)));
  delete from public.progress_photos
    where coach_id=uid and status='pending' and created_at < now() - interval '1 day';
  select coalesce(jsonb_agg(j),'[]'::jsonb) into result
    from (select id,asset_path from private.progress_photo_deletions where coach_id=uid order by created_at limit 100) j;
  return result;
end $$;

do $$
declare
  definition text;
  original_insert text := 'insert into public.progress_photos(id,client_id,coach_id,author_id,entry_date,filename,size,mime) values((payload->>''id'')::uuid,c.id,c.coach_id,uid,(payload->>''entry_date'')::date,payload->>''filename'',(payload->>''size'')::int,payload->>''mime'') returning to_jsonb(progress_photos) into result;';
  updated_insert text := 'if coalesce((payload->>''consent_confirmed'')::boolean,false) is not true then raise exception ''يلزم تأكيد موافقة المتدرب على رفع الصور''; end if;
 insert into public.progress_photos(id,client_id,coach_id,author_id,entry_date,filename,size,mime,angle,consented_at,consent_source)
 values((payload->>''id'')::uuid,c.id,c.coach_id,uid,(payload->>''entry_date'')::date,payload->>''filename'',(payload->>''size'')::int,payload->>''mime'',coalesce(payload->>''angle'',''unspecified''),now(),case when uid is null then ''trainee'' else ''coach_attestation'' end)
 on conflict(id) do update set id=excluded.id
 where progress_photos.client_id=excluded.client_id and progress_photos.coach_id=excluded.coach_id
 and progress_photos.author_id is not distinct from excluded.author_id and progress_photos.entry_date=excluded.entry_date
 and progress_photos.filename=excluded.filename and progress_photos.size=excluded.size and progress_photos.mime=excluded.mime
 and progress_photos.angle=excluded.angle and progress_photos.status in (''pending'',''ready'')
 returning to_jsonb(progress_photos) into result;
 if result is null then raise exception ''تعذر استئناف رفع الصورة؛ ابدأ رفعًا جديدًا''; end if;';
begin
  select pg_get_functiondef('private.photo_command(text,jsonb)'::regprocedure) into definition;
  if position(original_insert in definition) = 0 then
    raise exception 'Could not locate photo_command upload statement';
  end if;
  definition := replace(definition, original_insert, updated_insert);
  execute definition;

  original_insert := 'insert into public.progress_photos(id,client_id,coach_id,author_id,entry_date,filename,size,mime) values((input_data->>''id'')::uuid,cid,owner,null,(input_data->>''entry_date'')::date,input_data->>''filename'',(input_data->>''size'')::int,input_data->>''mime'') returning to_jsonb(progress_photos) into result;';
  updated_insert := 'if coalesce((input_data->>''consent_confirmed'')::boolean,false) is not true then raise exception ''يلزم تأكيد موافقة المتدرب على رفع الصور''; end if;
  insert into public.progress_photos(id,client_id,coach_id,author_id,entry_date,filename,size,mime,angle,consented_at,consent_source)
  values((input_data->>''id'')::uuid,cid,owner,null,(input_data->>''entry_date'')::date,input_data->>''filename'',(input_data->>''size'')::int,input_data->>''mime'',coalesce(input_data->>''angle'',''unspecified''),now(),''trainee'')
  on conflict(id) do update set id=excluded.id
  where progress_photos.client_id=excluded.client_id and progress_photos.coach_id=excluded.coach_id
  and progress_photos.author_id is null and progress_photos.entry_date=excluded.entry_date
  and progress_photos.filename=excluded.filename and progress_photos.size=excluded.size and progress_photos.mime=excluded.mime
  and progress_photos.angle=excluded.angle and progress_photos.status in (''pending'',''ready'')
  returning to_jsonb(progress_photos) into result;
  if result is null then raise exception ''تعذر استئناف رفع الصورة؛ ابدأ رفعًا جديدًا''; end if;';
  select pg_get_functiondef('private.portal_management(text,text,text,jsonb)'::regprocedure) into definition;
  if position(original_insert in definition) = 0 then
    raise exception 'Could not locate portal_management upload statement';
  end if;
  definition := replace(definition, original_insert, updated_insert);
  definition := regexp_replace(
    definition,
    '''filename''[[:space:]]*,[[:space:]]*p\.filename[[:space:]]*,[[:space:]]*''status''[[:space:]]*,[[:space:]]*p\.status',
    '''filename'',p.filename,''status'',p.status,''angle'',p.angle,''consented_at'',p.consented_at,''created_at'',p.created_at',
    'g'
  );
  if position('p.angle' in definition) = 0 then
    raise exception 'Could not add progress photo metadata to portal snapshot';
  end if;
  execute definition;

  select pg_get_functiondef('private.management_snapshot()'::regprocedure) into definition;
  definition := regexp_replace(
    definition,
    '''filename''[[:space:]]*,[[:space:]]*p\.filename[[:space:]]*,[[:space:]]*''status''[[:space:]]*,[[:space:]]*p\.status',
    '''filename'',p.filename,''status'',p.status,''angle'',p.angle,''consented_at'',p.consented_at,''created_at'',p.created_at',
    'g'
  );
  if position('p.angle' in definition) = 0 then
    raise exception 'Could not add progress photo metadata to management snapshot';
  end if;
  execute definition;

  select pg_get_functiondef('private.valid_coaching_record(text,jsonb)'::regprocedure) into definition;
  if position('calf' in definition) = 0 then
    definition := replace(
      definition,
      '''thigh'',''hips'',''bmi''',
      '''thigh'',''hips'',''calf'',''bmi'''
    );
    definition := replace(definition, '''thigh'',''hips'',''bmi'',''calories''', '''thigh'',''hips'',''calf'',''bmi'',''calories''');
    definition := regexp_replace(definition, 'when k[[:space:]]*=[[:space:]]*''weight''[[:space:]]+then[[:space:]]+20', 'when k=''weight'' then 20 when k=''calf'' then 0.01', 'g');
    definition := regexp_replace(definition, 'when k[[:space:]]*=[[:space:]]*''bmi''[[:space:]]+then[[:space:]]+150[[:space:]]+else[[:space:]]+300', 'when k=''bmi'' then 150 when k=''calf'' then 120 else 300', 'g');
    if position('calf' in definition) = 0 or position('then 120' in definition) = 0 then
      raise exception 'Could not add calf to the coaching record validator';
    end if;
    execute definition;
  end if;

  select pg_get_functiondef('private.management_command(text,jsonb)'::regprocedure) into definition;
  if position('photo_delete' in definition) = 0 then
    definition := replace(
      definition,
      'if command in (''photo_reserve'',''photo_ready'') then return private.photo_command(command,input_data); end if;',
      'if command in (''photo_reserve'',''photo_ready'',''photo_delete'') then return private.photo_command(command,input_data); end if;'
    );
    if position('photo_delete' in definition) = 0 then
      raise exception 'Could not add photo deletion to management command';
    end if;
    execute definition;
  end if;

  execute $fn$
    create or replace function private.photo_command(command text,payload jsonb)
    returns jsonb language plpgsql security definer set search_path=''
    as $body$
    declare uid uuid:=private.session_uid(); c public.clients; p public.progress_photos; result jsonb;
    begin
      if command='photo_delete' then
        select * into p from public.progress_photos where id=(payload->>'id')::uuid;
        if p.id is null then return jsonb_build_object('id',(payload->>'id')::uuid,'deleted',true); end if;
        select * into c from public.clients where id=p.client_id and not archived and (coach_id=uid or trainee_user_id=uid);
        if c.id is null then raise exception 'الصورة غير متاحة'; end if;
        delete from public.progress_photos where id=p.id;
        return jsonb_build_object('id',p.id,'deleted',true);
      end if;
      select * into c from public.clients where id=(payload->>'client_id')::uuid and not archived and (coach_id=uid or trainee_user_id=uid);
      if c.id is null then raise exception 'العميل غير متاح'; end if;
      if command<>'photo_reserve' then raise exception 'يلزم تأكيد الرفع من الخادم'; end if;
      if (select count(*) from public.progress_photos where client_id=c.id and created_at>now()-interval '1 day')>=30 then raise exception 'حد الصور اليومي 30'; end if;
      if coalesce((payload->>'consent_confirmed')::boolean,false) is not true then raise exception 'يلزم تأكيد موافقة المتدرب على رفع الصور'; end if;
      insert into public.progress_photos(id,client_id,coach_id,author_id,entry_date,filename,size,mime,angle,consented_at,consent_source)
      values((payload->>'id')::uuid,c.id,c.coach_id,uid,(payload->>'entry_date')::date,payload->>'filename',(payload->>'size')::int,payload->>'mime',coalesce(payload->>'angle','unspecified'),now(),case when uid is null then 'trainee' else 'coach_attestation' end)
      on conflict(id) do update set id=excluded.id
      where progress_photos.client_id=excluded.client_id and progress_photos.coach_id=excluded.coach_id
        and progress_photos.author_id is not distinct from excluded.author_id and progress_photos.entry_date=excluded.entry_date
        and progress_photos.filename=excluded.filename and progress_photos.size=excluded.size and progress_photos.mime=excluded.mime
        and progress_photos.angle=excluded.angle and progress_photos.status in ('pending','ready')
      returning to_jsonb(progress_photos) into result;
      if result is null then raise exception 'تعذر استئناف رفع الصورة؛ ابدأ رفعًا جديدًا'; end if;
      return result;
    end $body$;
  $fn$;

  select pg_get_functiondef('private.portal_management(text,text,text,jsonb)'::regprocedure) into definition;
  if position('elsif command=''photo_delete''' in definition) = 0 then
    definition := replace(
      definition,
      'elsif command<>''snapshot'' then raise exception ''عملية غير صالحة''; end if;',
      'elsif command=''photo_delete'' then
  if not exists(select 1 from public.progress_photos where id=(input_data->>''id'')::uuid and client_id=cid) then raise exception ''الصورة غير متاحة''; end if;
  delete from public.progress_photos where id=(input_data->>''id'')::uuid and client_id=cid;
  return jsonb_build_object(''id'',(input_data->>''id'')::uuid,''deleted'',true);
 elsif command<>''snapshot'' then raise exception ''عملية غير صالحة''; end if;'
    );
    if position('elsif command=''photo_delete''' in definition) = 0 then
      raise exception 'Could not add scoped portal photo deletion';
    end if;
    execute definition;
  end if;
end $$;
