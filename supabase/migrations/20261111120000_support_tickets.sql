-- Private in-app support inbox. Owner identity is provisioned out of band.
create table public.support_tickets (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('suggestion','bug')),
 title text not null check(length(title) between 4 and 120),
 description text not null check(length(description) between 10 and 5000),
 attachment_path text,
 status text not null default 'open' check(status in ('open','in_progress','resolved','closed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index support_tickets_created_idx on public.support_tickets(created_at desc);
create index support_tickets_author_idx on public.support_tickets(author_id,created_at desc);
alter table public.support_tickets enable row level security;
create policy support_ticket_select on public.support_tickets for select to authenticated,coach_api using(author_id=(select private.session_uid()));
create policy support_ticket_insert on public.support_tickets for insert to authenticated,coach_api with check(author_id=(select private.session_uid()));
grant select,insert on public.support_tickets to authenticated,coach_api;
revoke update,delete on public.support_tickets from authenticated,coach_api;

create function public.support_ticket_create(p_kind text,p_title text,p_description text,p_attachment_path text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid:=private.session_uid(); row_data public.support_tickets;
begin
 if uid is null then raise exception 'authentication required'; end if;
 if (select count(*) from public.support_tickets where author_id=uid and created_at>now()-interval '1 hour')>=5 then raise exception 'ticket rate limit exceeded'; end if;
 if p_attachment_path is not null and p_attachment_path !~ ('^'||uid::text||'/[0-9a-f-]{36}$') then raise exception 'invalid attachment'; end if;
 insert into public.support_tickets(author_id,kind,title,description,attachment_path)
 values(uid,p_kind,p_title,p_description,p_attachment_path) returning * into row_data;
 return jsonb_build_object('id',row_data.id,'created_at',row_data.created_at);
end $$;
revoke all on function public.support_ticket_create(text,text,text,text) from public,anon;
grant execute on function public.support_ticket_create(text,text,text,text) to authenticated;

create function public.support_ticket_list() returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at desc),'[]'::jsonb) from (
  select t.* from public.support_tickets t where t.author_id=private.session_uid() order by t.created_at desc limit 100
 ) rows
$$;
revoke all on function public.support_ticket_list() from public,anon;
grant execute on function public.support_ticket_list() to authenticated;

do $$ begin
 if to_regclass('storage.buckets') is not null then
  execute 'insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(''support-attachments'',''support-attachments'',false,5242880,array[''image/jpeg'',''image/png'',''image/webp'']) on conflict(id) do nothing';
 end if;
end $$;
