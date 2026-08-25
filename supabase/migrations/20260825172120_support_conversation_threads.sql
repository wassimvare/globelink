create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_kind text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint support_ticket_messages_sender_kind_check check (sender_kind = any (array['user','staff'])),
  constraint support_ticket_messages_body_length check (char_length(body) between 1 and 5000)
);

create index if not exists support_ticket_messages_ticket_created_idx
  on public.support_ticket_messages(ticket_id, created_at asc);

alter table public.support_ticket_messages enable row level security;

drop policy if exists "support_ticket_messages_select_participants" on public.support_ticket_messages;
create policy "support_ticket_messages_select_participants"
on public.support_ticket_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_tickets t
    where t.id = ticket_id
      and (
        t.user_id = (select auth.uid())
        or private.is_moderator_or_admin((select auth.uid()))
      )
  )
);

drop policy if exists "support_ticket_messages_insert_participants" on public.support_ticket_messages;
create policy "support_ticket_messages_insert_participants"
on public.support_ticket_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and (
    (
      sender_kind = 'user'
      and exists (
        select 1
        from public.support_tickets t
        where t.id = ticket_id
          and t.user_id = (select auth.uid())
          and t.status <> 'closed'
      )
    )
    or (
      sender_kind = 'staff'
      and private.is_moderator_or_admin((select auth.uid()))
    )
  )
);

revoke all on table public.support_ticket_messages from public, anon, authenticated;
grant select, insert on table public.support_ticket_messages to authenticated;
grant all on table public.support_ticket_messages to service_role;

create or replace function private.sync_support_ticket_after_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.sender_kind = 'user' then
    update public.support_tickets
      set status = 'in_progress', resolved_at = null, updated_at = now()
    where id = new.ticket_id and status <> 'closed';
  else
    update public.support_tickets
      set updated_at = now()
    where id = new.ticket_id;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_support_ticket_after_message() from public, anon, authenticated;

drop trigger if exists support_ticket_messages_sync_ticket on public.support_ticket_messages;
create trigger support_ticket_messages_sync_ticket
after insert on public.support_ticket_messages
for each row execute function private.sync_support_ticket_after_message();

insert into public.support_ticket_messages (ticket_id, sender_id, sender_kind, body, created_at)
select t.id, t.handled_by, 'staff', t.admin_reply, coalesce(t.updated_at, t.created_at)
from public.support_tickets t
where nullif(btrim(t.admin_reply), '') is not null
  and not exists (
    select 1 from public.support_ticket_messages m
    where m.ticket_id = t.id and m.sender_kind = 'staff' and m.body = t.admin_reply
  );
