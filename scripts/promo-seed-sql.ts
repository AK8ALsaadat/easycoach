import type { buildPromoDataset } from "./promo-dataset.ts";

export const PROMO_RUN = "seed:promo-2026";
export const PROMO_PROJECT = "trlgsugychocgwtnmzej";
export type PromoAccount = { id: string; clientId: string; email: string; passwordHash: string; createdAt: string };
type Dataset = ReturnType<typeof buildPromoDataset>;
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const json = (value: unknown) => literal(JSON.stringify(value)) + "::jsonb";

/** Shared shapes and value nodes keep the Management API request below its body limit. */
export function packPromoInput(value: unknown) {
  const nodes: unknown[] = [], shapes: string[][] = [];
  const nodeIds = new Map<string, number>(), shapeIds = new Map<string, number>();
  function encode(value: unknown): number {
    let node: unknown = value;
    if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))
      node = [-2, Buffer.from(value.replaceAll("-", ""), "hex").toString("base64")];
    else if (Array.isArray(value)) node = [-1, ...value.map(encode)];
    else if (value && typeof value === "object") {
      const keys = Object.keys(value), key = JSON.stringify(keys);
      if (!shapeIds.has(key)) { shapeIds.set(key, shapes.length); shapes.push(keys); }
      node = [shapeIds.get(key), ...Object.values(value).map(encode)];
    }
    const key = JSON.stringify(node);
    if (!nodeIds.has(key)) { nodeIds.set(key, nodes.length); nodes.push(node); }
    return nodeIds.get(key)!;
  }
  const root = encode(value);
  return { nodes, shapes, root };
}

function unpackSql(value: unknown) {
  return `create temporary table promo_node_cache(id integer primary key,value jsonb) on commit drop;
create temporary table promo_input(data jsonb) on commit drop;
do $$ declare packed jsonb:=${json(packPromoInput(value))}; n jsonb; v jsonb; i bigint; hex text; begin
 for n,i in select value,ordinality-1 from jsonb_array_elements(packed->'nodes') with ordinality loop
  if jsonb_typeof(n)<>'array' then v:=n;
  elsif n->>0='-2' then
   hex:=encode(decode(n->>1,'base64'),'hex');
   v:=to_jsonb((substr(hex,1,8)||'-'||substr(hex,9,4)||'-'||substr(hex,13,4)||'-'||substr(hex,17,4)||'-'||substr(hex,21,12))::text);
  elsif n->>0='-1' then
   select coalesce(jsonb_agg(c.value order by e.ordinality),'[]'::jsonb) into v
    from jsonb_array_elements(n) with ordinality e join promo_node_cache c on c.id=(e.value::text)::int where e.ordinality>1;
  else
   select coalesce(jsonb_object_agg(packed->'shapes'->(n->>0)::int->>(e.ordinality-2)::int,c.value),'{}'::jsonb) into v
    from jsonb_array_elements(n) with ordinality e join promo_node_cache c on c.id=(e.value::text)::int where e.ordinality>1;
  end if;
  insert into promo_node_cache values(i,v);
 end loop;
 insert into promo_input select value from promo_node_cache where id=(packed->>'root')::int;
end $$;`;
}

const registry = `
create table if not exists private.promo_seed_runs (
 run_key text primary key, coach_id uuid not null, created_at timestamptz not null default now(), summary jsonb not null
);
create table if not exists private.promo_seed_rows (
 run_key text not null references private.promo_seed_runs(run_key), table_name text not null,
 row_id uuid not null, primary key(run_key,table_name,row_id)
);
revoke all on private.promo_seed_runs,private.promo_seed_rows from public,anon,authenticated,coach_api;
alter table private.promo_seed_runs enable row level security;
alter table private.promo_seed_rows enable row level security;
`;

function ownerGuard(email: string) {
  return `
select pg_advisory_xact_lock(hashtextextended(${literal(PROMO_RUN + ":" + email)},0));
create temporary table promo_owner on commit drop as
 select u.id from auth.users u where lower(u.email)=${literal(email.toLowerCase())}
 and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
do $$ begin
 if (select count(*) from promo_owner)<>1 then raise exception 'Expected one verified Google owner'; end if;
 if exists(select 1 from public.profiles p join promo_owner o on o.id=p.id where p.role<>'coach') then raise exception 'Owner profile is not a coach'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from promo_owner),true);
`;
}

/** All application and Auth writes are in this one transaction, including dry-run rollback. */
export function promoSeedSql(dataset: Dataset, accounts: PromoAccount[], email: string, dryRun = true) {
  const payload = { clients: dataset.clients, accounts };
  return `begin isolation level repeatable read;
set local statement_timeout='180s';
${ownerGuard(email)}
${registry}
do $$ begin
 if exists(select 1 from private.promo_seed_runs where run_key=${literal(PROMO_RUN)}) then raise exception 'Promo seed already exists; no records were changed'; end if;
end $$;
${unpackSql(payload)}
create temporary table promo_client_ids on commit drop as select (value->>'id')::uuid id from promo_input,jsonb_array_elements(data->'clients');
create temporary table promo_existing_audit on commit drop as select id from public.audit where coach_id=(select id from promo_owner);
do $$ declare c jsonb; a jsonb; s jsonb; p jsonb; f jsonb; r jsonb; w jsonb; cid uuid; uid uuid; owner uuid:=(select id from promo_owner); begin
 if not exists(select 1 from public.profiles where id=owner) then perform public.init_profile('مدرب إيزي كوتش','coach'); end if;
 for a in select value from promo_input,jsonb_array_elements(data->'accounts') loop
  if exists(select 1 from auth.users where id=(a->>'id')::uuid or lower(email)=lower(a->>'email')) then raise exception 'Seed auth collision; refusing to overwrite an account'; end if;
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,
   is_super_admin,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,reauthentication_token)
  values('00000000-0000-0000-0000-000000000000',(a->>'id')::uuid,'authenticated','authenticated',a->>'email',a->>'passwordHash',now(),
   jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'promo_seed',${literal(PROMO_RUN)}),
   jsonb_build_object('role','trainee','promo_seed',${literal(PROMO_RUN)}),false,(a->>'createdAt')::timestamptz,now(),'','','','','','');
  insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at)
   values(gen_random_uuid(),a->>'id',(a->>'id')::uuid,jsonb_build_object('sub',a->>'id','email',a->>'email','email_verified',true,'phone_verified',false),'email',now(),now());
  perform set_config('request.jwt.claim.sub',a->>'id',true);
  perform public.init_profile((select value->>'name' from promo_input,jsonb_array_elements(data->'clients') where value->>'id'=a->>'clientId'),'trainee');
 end loop;
 perform set_config('request.jwt.claim.sub',owner::text,true);
 for c in select value from promo_input,jsonb_array_elements(data->'clients') loop
  cid:=(c->>'id')::uuid;
  uid:=(select (value->>'id')::uuid from promo_input,jsonb_array_elements(data->'accounts') where value->>'clientId'=cid::text);
  if exists(select 1 from public.clients where id=cid or (coach_id=owner and email=c->>'email')) then raise exception 'Seed client collision'; end if;
  insert into public.clients(id,coach_id,name,email,phone,trainee_user_id,created_at,updated_at)
   values(cid,owner,c->>'name',c->>'email',c->>'phone',uid,(c->>'joined')::date,(c->>'joined')::date);
  insert into public.client_details(client_id,coach_id,age,gender,height,start_date,status,updated_at)
   values(cid,owner,(c->'details'->>'age')::int,c->'details'->>'gender',(c->'details'->>'height')::numeric,(c->>'joined')::date,c->'details'->>'status',(c->>'joined')::date);
  insert into public.client_goals(client_id,coach_id,goal,target_weight,focus,notes,updated_at)
   values(cid,owner,c->'goal'->>'goal',(c->'goal'->>'target_weight')::numeric,c->'goal'->>'focus',c->'goal'->>'notes',(c->>'joined')::date);
  insert into public.client_checkin_schedules(client_id,coach_id,weight_days,measurement_days,photo_days)
   values(cid,owner,(c->'schedule'->>'weight_days')::int,(c->'schedule'->>'measurement_days')::int,(c->'schedule'->>'photo_days')::int);
  insert into public.programs(id,coach_id,client_id,name,content,published_at,created_at)
   values((c->'program'->>'id')::uuid,owner,cid,c->'program'->>'name',c->'program'->'content',(c->'program'->>'published_at')::timestamptz,(c->'program'->>'created_at')::timestamptz);
  for s in select value from jsonb_array_elements(c->'subscriptions') loop
   insert into public.subscriptions(id,coach_id,client_id,name,start_date,end_date,price,previous_id,created_at)
    values((s->>'id')::uuid,owner,cid,s->>'name',(s->>'start_date')::date,(s->>'end_date')::date,(s->>'price')::numeric,nullif(s->>'previous_id','')::uuid,(s->>'created_at')::timestamptz);
   for p in select value from jsonb_array_elements(s->'payments') loop
    insert into public.payments(id,coach_id,subscription_id,amount,method,paid_date,reference,kind,created_at)
     values((p->>'id')::uuid,owner,(s->>'id')::uuid,(p->>'amount')::numeric,p->>'method',(p->>'paid_date')::date,p->>'reference','payment',(p->>'created_at')::timestamptz);
   end loop;
   for f in select value from jsonb_array_elements(s->'freezes') loop
    insert into public.freezes(id,coach_id,subscription_id,start_date,end_date,days,applied_at)
     values((f->>'id')::uuid,owner,(s->>'id')::uuid,(f->>'start_date')::date,(f->>'end_date')::date,(f->>'days')::int,(f->>'applied_at')::timestamptz);
   end loop;
  end loop;
  for w in select value from jsonb_array_elements(c->'weights') loop
   insert into public.weight_entries(id,client_id,coach_id,entry_date,weight,updated_at)
    values((w->>'id')::uuid,cid,owner,(w->>'entry_date')::date,(w->>'weight')::numeric,(w->>'updated_at')::timestamptz);
  end loop;
  for r in select value from jsonb_array_elements(c->'records') loop
   insert into public.coaching_records(id,client_id,coach_id,kind,entry_date,payload,author_id,author_type,source_key,created_at,updated_at,reviewed_at,coach_feedback,read_at)
    values((r->>'id')::uuid,cid,owner,r->>'kind',(r->>'entry_date')::date,r->'payload',case when r->>'author_type'='coach' then owner else uid end,r->>'author_type',r->>'source_key',
     (r->>'created_at')::timestamptz,(r->>'updated_at')::timestamptz,nullif(r->>'reviewed_at','')::timestamptz,coalesce(r->>'coach_feedback',''),nullif(r->>'read_at','')::timestamptz);
  end loop;
 end loop;
end $$;
insert into private.promo_seed_runs(run_key,coach_id,summary) values(${literal(PROMO_RUN)},(select id from promo_owner),${json(dataset.summary)});
${captureRows()}
select jsonb_build_object('run',${literal(PROMO_RUN)},'dry_run',${dryRun},'summary',${json(dataset.summary)},'tracked_rows',(select count(*) from private.promo_seed_rows where run_key=${literal(PROMO_RUN)})) result;
${dryRun ? "rollback" : "commit"};`;
}

function captureRows() {
  return `do $$ declare t text; key text; begin
 foreach t in array array['clients','client_details','client_goals','client_checkin_schedules','programs','weight_entries','coaching_records','subscriptions'] loop
  key:=case when t in ('client_details','client_goals','client_checkin_schedules') then 'client_id' else 'id' end;
  execute format('insert into private.promo_seed_rows select %L,%L,%I from public.%I where %I in (select id from promo_client_ids)',${literal(PROMO_RUN)},t,key,t,case when t='clients' then 'id' else 'client_id' end);
 end loop;
 foreach t in array array['payments','freezes'] loop
  execute format('insert into private.promo_seed_rows select %L,%L,id from public.%I where subscription_id in (select id from public.subscriptions where client_id in (select id from promo_client_ids))',${literal(PROMO_RUN)},t,t);
 end loop;
 insert into private.promo_seed_rows select ${literal(PROMO_RUN)},'profiles',id from public.profiles where id in (select (value->>'id')::uuid from promo_input,jsonb_array_elements(data->'accounts'));
 insert into private.promo_seed_rows select ${literal(PROMO_RUN)},'auth.users',(value->>'id')::uuid from promo_input,jsonb_array_elements(data->'accounts');
 insert into private.promo_seed_rows select ${literal(PROMO_RUN)},'auth.identities',id from auth.identities where user_id in (select row_id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='auth.users');
 insert into private.promo_seed_rows select ${literal(PROMO_RUN)},'audit',id from public.audit where coach_id=(select id from promo_owner) and id not in (select id from promo_existing_audit);
end $$;`;
}

/** Fail closed if later data was added; never silently remove non-seed activity. */
export function promoCleanupSql(email: string, dryRun = true) {
  return `begin isolation level repeatable read;
set local statement_timeout='180s';
${ownerGuard(email)}
do $$ begin
 if not exists(select 1 from private.promo_seed_runs where run_key=${literal(PROMO_RUN)} and coach_id=(select id from promo_owner)) then raise exception 'No matching promo run owned by this coach'; end if;
end $$;
create temporary table promo_client_ids on commit drop as select row_id id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='clients';
create temporary table promo_cleanup_audit on commit drop as select id from public.audit;
do $$ declare t text; key text; extra boolean; begin
 if exists(select 1 from public.clients c join promo_client_ids s on s.id=c.id where c.coach_id<>(select id from promo_owner)) then raise exception 'Seed client ownership changed'; end if;
 if exists(select 1 from auth.users u join private.promo_seed_rows r on r.row_id=u.id and r.run_key=${literal(PROMO_RUN)} and r.table_name='auth.users' where u.raw_app_meta_data->>'promo_seed' is distinct from ${literal(PROMO_RUN)}) then raise exception 'Seed account marker changed'; end if;
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='client_id' loop
  -- Additive tables may use client_id as their primary key (for example team assignments).
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='id') then key:='id'; else key:='client_id'; end if;
  execute format('select exists(select 1 from public.%I x where x.client_id in (select id from promo_client_ids) and not exists(select 1 from private.promo_seed_rows r where r.run_key=%L and r.table_name=%L and r.row_id=x.%I))',t,${literal(PROMO_RUN)},t,key) into extra;
  if extra then raise exception 'Untracked data in %; cleanup aborted without deleting anything',t; end if;
 end loop;
 if exists(select 1 from public.clients c where c.trainee_user_id in(select row_id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='auth.users') and c.id not in(select id from promo_client_ids)) then raise exception 'Seed account has another client relationship'; end if;
end $$;
insert into private.client_purges(txid,client_id) select txid_current(),id from promo_client_ids;
delete from public.weight_entries where id in(select row_id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='weight_entries');
delete from public.payments where id in(select row_id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='payments') and kind='reversal';
delete from public.payments where id in(select row_id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='payments');
delete from public.freezes where id in(select row_id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='freezes');
delete from public.subscriptions where id in(select row_id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='subscriptions');
delete from public.programs where id in(select row_id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='programs');
delete from public.client_goals where client_id in(select id from promo_client_ids);
delete from public.clients where id in(select id from promo_client_ids);
delete from public.audit where id in(select row_id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='audit')
 or (id not in(select id from promo_cleanup_audit) and coach_id=(select id from promo_owner)
 and (client_id in(select id from promo_client_ids) or entity_id in(select row_id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)})));
delete from public.profiles where id in(select row_id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='profiles');
delete from auth.users where id in(select row_id from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='auth.users');
delete from private.client_purges where txid=txid_current();
select jsonb_build_object('run',${literal(PROMO_RUN)},'dry_run',${dryRun},'removed_clients',(select count(*) from promo_client_ids),'removed_accounts',(select count(*) from private.promo_seed_rows where run_key=${literal(PROMO_RUN)} and table_name='auth.users')) result;
delete from private.promo_seed_rows where run_key=${literal(PROMO_RUN)};
delete from private.promo_seed_runs where run_key=${literal(PROMO_RUN)};
${dryRun ? "rollback" : "commit"};`;
}
