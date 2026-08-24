-- GlobeLink V10.5: user-submitted places/activities require AI pre-review
-- and explicit admin approval before appearing publicly on the map.

begin;

alter table public.places
  add column if not exists moderation_status text,
  add column if not exists moderation_ai_score integer,
  add column if not exists moderation_ai_summary text,
  add column if not exists moderation_ai_flags text[] not null default '{}'::text[],
  add column if not exists moderation_ai_checked_at timestamptz,
  add column if not exists moderation_reviewed_at timestamptz,
  add column if not exists moderation_reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderation_rejection_reason text;

-- Existing community places were already public before this moderation workflow.
update public.places
set moderation_status = 'approved',
    moderation_reviewed_at = coalesce(moderation_reviewed_at, created_at)
where moderation_status is null;

alter table public.places
  alter column moderation_status set default 'pending',
  alter column moderation_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'places_moderation_status_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_moderation_status_check
      check (moderation_status in ('pending', 'ai_flagged', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'places_moderation_ai_score_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_moderation_ai_score_check
      check (moderation_ai_score is null or moderation_ai_score between 0 and 100);
  end if;
end $$;

create index if not exists places_moderation_status_created_idx
  on public.places (moderation_status, created_at desc);

create index if not exists places_moderation_reviewer_idx
  on public.places (moderation_reviewed_by, moderation_reviewed_at desc);

create or replace function private.enforce_place_moderation_write_guard()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
     or private.current_user_is_staff() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.moderation_status := 'pending';
    new.moderation_ai_score := null;
    new.moderation_ai_summary := null;
    new.moderation_ai_flags := '{}'::text[];
    new.moderation_ai_checked_at := null;
    new.moderation_reviewed_at := null;
    new.moderation_reviewed_by := null;
    new.moderation_rejection_reason := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.moderation_status := old.moderation_status;
    new.moderation_ai_score := old.moderation_ai_score;
    new.moderation_ai_summary := old.moderation_ai_summary;
    new.moderation_ai_flags := old.moderation_ai_flags;
    new.moderation_ai_checked_at := old.moderation_ai_checked_at;
    new.moderation_reviewed_at := old.moderation_reviewed_at;
    new.moderation_reviewed_by := old.moderation_reviewed_by;
    new.moderation_rejection_reason := old.moderation_rejection_reason;
    return new;
  end if;

  return new;
end
$$;

drop trigger if exists enforce_place_moderation_write_guard on public.places;
create trigger enforce_place_moderation_write_guard
before insert or update on public.places
for each row execute function private.enforce_place_moderation_write_guard();

drop policy if exists "Places viewable by everyone" on public.places;
drop policy if exists "Places approved viewable by everyone" on public.places;
drop policy if exists "Users view own submitted places" on public.places;
drop policy if exists "Admins view all places" on public.places;
drop policy if exists "Users create places" on public.places;
drop policy if exists "Users create places pending review" on public.places;
drop policy if exists "Users update own places" on public.places;
drop policy if exists "Users update own pending places" on public.places;
drop policy if exists "Admins moderate places" on public.places;
drop policy if exists "Users delete own places" on public.places;

create policy "Places approved viewable by everyone"
on public.places for select
to anon, authenticated
using (moderation_status = 'approved');

create policy "Users view own submitted places"
on public.places for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Admins view all places"
on public.places for select
to authenticated
using (private.current_user_is_staff());

create policy "Users create places pending review"
on public.places for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and moderation_status in ('pending', 'ai_flagged')
  and moderation_reviewed_at is null
  and moderation_reviewed_by is null
);

create policy "Users update own pending places"
on public.places for update
to authenticated
using (
  (select auth.uid()) = user_id
  and moderation_status in ('pending', 'ai_flagged')
)
with check (
  (select auth.uid()) = user_id
  and moderation_status in ('pending', 'ai_flagged')
  and moderation_reviewed_at is null
  and moderation_reviewed_by is null
);

create policy "Admins moderate places"
on public.places for update
to authenticated
using (private.current_user_is_staff())
with check (private.current_user_is_staff());

create policy "Users delete own places"
on public.places for delete
to authenticated
using ((select auth.uid()) = user_id);

commit;
