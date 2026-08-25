create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  message_permission text not null default 'everyone' check (message_permission in ('everyone','following','matches','nobody')),
  allow_comments boolean not null default true,
  allow_mentions boolean not null default true,
  travel_match_enabled boolean not null default true,
  travel_match_verified_only boolean not null default false,
  travel_match_age_min integer not null default 18 check (travel_match_age_min between 18 and 99),
  travel_match_age_max integer not null default 99 check (travel_match_age_max between 18 and 99),
  preferred_budget text not null default 'balanced' check (preferred_budget in ('budget','balanced','comfort','premium')),
  preferred_currency text not null default 'EUR',
  travel_interests text[] not null default '{}',
  use_location boolean not null default false,
  precise_location boolean not null default false,
  map_hotels boolean not null default true,
  map_restaurants boolean not null default true,
  map_activities boolean not null default true,
  map_offers boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (travel_match_age_min <= travel_match_age_max)
);

grant select, insert, update, delete on public.user_settings to authenticated;
grant all on public.user_settings to service_role;
alter table public.user_settings enable row level security;

drop policy if exists "Users manage own settings" on public.user_settings;
create policy "Users manage own settings"
on public.user_settings
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table if not exists public.user_relationship_controls (
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('blocked','restricted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, target_id),
  check (owner_id <> target_id)
);

grant select, insert, update, delete on public.user_relationship_controls to authenticated;
grant all on public.user_relationship_controls to service_role;
alter table public.user_relationship_controls enable row level security;

drop policy if exists "Users manage own relationship controls" on public.user_relationship_controls;
create policy "Users manage own relationship controls"
on public.user_relationship_controls
for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create or replace function public.get_unavailable_user_ids()
returns table(user_id uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  select distinct unavailable_id
  from (
    select c.target_id as unavailable_id
    from public.user_relationship_controls c
    where c.owner_id = (select auth.uid()) and c.mode = 'blocked'
    union all
    select c.owner_id as unavailable_id
    from public.user_relationship_controls c
    where c.target_id = (select auth.uid()) and c.mode = 'blocked'
  ) blocked
  where (select auth.uid()) is not null;
$$;
revoke all on function public.get_unavailable_user_ids() from public;
grant execute on function public.get_unavailable_user_ids() to authenticated;

create or replace function public.open_or_create_direct_conversation(_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := (select auth.uid());
  existing_conv uuid;
  created_conv uuid;
  lock_key text;
  recipient_permission text := 'everyone';
  recipient_follows_sender boolean := false;
  mutual_match boolean := false;
begin
  if current_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if _other_user_id is null or _other_user_id = current_user_id then
    raise exception 'Invalid target profile' using errcode = '22023';
  end if;
  if not public.current_user_email_verified() then
    raise exception 'Email verification required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id and email_verified_at is not null and status = 'active'
  ) then
    raise exception 'Current profile is not active' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = _other_user_id and email_verified_at is not null and status = 'active'
  ) then
    raise exception 'Target profile not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_relationship_controls c
    where c.mode = 'blocked'
      and ((c.owner_id = current_user_id and c.target_id = _other_user_id)
        or (c.owner_id = _other_user_id and c.target_id = current_user_id))
  ) then
    raise exception 'Ce compte n''est pas disponible.' using errcode = '42501';
  end if;

  lock_key := least(current_user_id::text, _other_user_id::text)
    || ':' || greatest(current_user_id::text, _other_user_id::text);
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));

  select cp1.conversation_id into existing_conv
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp2.conversation_id = cp1.conversation_id
  where cp1.user_id = current_user_id
    and cp2.user_id = _other_user_id
    and (
      select count(*) from public.conversation_participants members
      where members.conversation_id = cp1.conversation_id
    ) = 2
  order by cp1.joined_at desc
  limit 1;

  if existing_conv is not null then
    return existing_conv;
  end if;

  select coalesce(s.message_permission, 'everyone')
  into recipient_permission
  from public.user_settings s
  where s.user_id = _other_user_id;
  recipient_permission := coalesce(recipient_permission, 'everyone');

  select exists (
    select 1 from public.follows f
    where f.follower_id = _other_user_id and f.following_id = current_user_id
  ) into recipient_follows_sender;

  select exists (
    select 1
    from public.match_likes a
    join public.match_likes b
      on b.from_user_id = a.to_user_id and b.to_user_id = a.from_user_id
    where a.from_user_id = current_user_id and a.to_user_id = _other_user_id
  ) into mutual_match;

  if recipient_permission = 'nobody' then
    raise exception 'Cette personne n''accepte pas de nouveaux messages.' using errcode = '42501';
  elsif recipient_permission = 'following' and not recipient_follows_sender and not mutual_match then
    raise exception 'Cette personne accepte les messages des comptes qu''elle suit.' using errcode = '42501';
  elsif recipient_permission = 'matches' and not mutual_match then
    raise exception 'Un match Travel Match est nécessaire pour écrire à cette personne.' using errcode = '42501';
  end if;

  insert into public.conversations default values returning id into created_conv;
  insert into public.conversation_participants (conversation_id, user_id)
  values (created_conv, current_user_id), (created_conv, _other_user_id)
  on conflict (conversation_id, user_id) do nothing;
  return created_conv;
end;
$$;
revoke all on function public.open_or_create_direct_conversation(uuid) from public;
grant execute on function public.open_or_create_direct_conversation(uuid) to authenticated;
