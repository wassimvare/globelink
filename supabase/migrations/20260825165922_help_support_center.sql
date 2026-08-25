create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  subject text not null,
  message text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  context jsonb not null default '{}'::jsonb,
  admin_reply text,
  handled_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_category_check check (category = any (array['bug','technical','account','safety','feedback','other'])),
  constraint support_tickets_status_check check (status = any (array['open','in_progress','waiting_user','resolved','closed'])),
  constraint support_tickets_priority_check check (priority = any (array['low','normal','high','urgent'])),
  constraint support_tickets_subject_length check (char_length(subject) between 3 and 160),
  constraint support_tickets_message_length check (char_length(message) between 10 and 5000),
  constraint support_tickets_reply_length check (char_length(coalesce(admin_reply, '')) <= 5000)
);

create index if not exists support_tickets_user_created_idx on public.support_tickets(user_id, created_at desc);
create index if not exists support_tickets_status_created_idx on public.support_tickets(status, created_at desc);

alter table public.support_tickets enable row level security;

drop policy if exists "support_tickets_select_own_or_staff" on public.support_tickets;
create policy "support_tickets_select_own_or_staff"
on public.support_tickets
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or private.is_moderator_or_admin((select auth.uid()))
);

drop policy if exists "support_tickets_insert_own" on public.support_tickets;
create policy "support_tickets_insert_own"
on public.support_tickets
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "support_tickets_staff_update" on public.support_tickets;
create policy "support_tickets_staff_update"
on public.support_tickets
for update
to authenticated
using (private.is_moderator_or_admin((select auth.uid())))
with check (private.is_moderator_or_admin((select auth.uid())));

drop policy if exists "support_tickets_staff_delete" on public.support_tickets;
create policy "support_tickets_staff_delete"
on public.support_tickets
for delete
to authenticated
using (private.is_moderator_or_admin((select auth.uid())));

revoke all on table public.support_tickets from anon;
grant select, insert, update, delete on table public.support_tickets to authenticated;
grant all on table public.support_tickets to service_role;

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

-- Remove legacy verified-user policies that allowed non-staff users to mutate reports.
drop policy if exists "v8_verified_insert_reports" on public.reports;
drop policy if exists "v8_verified_update_reports" on public.reports;
drop policy if exists "v8_verified_delete_reports" on public.reports;

-- Keep the intended report model explicit: reporter owns creation/read; staff owns moderation.
revoke all on table public.reports from anon;
grant select, insert, update, delete on table public.reports to authenticated;
grant all on table public.reports to service_role;
