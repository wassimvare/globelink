-- GlobeLink V11.0.2 automatic Supabase bootstrap.
-- This file is intentionally idempotent. It configures only the database
-- objects needed by the automatic internet catalog and the private place
-- analysis visibility fix, without touching Supabase migration history.

begin;

create schema if not exists extensions;
create schema if not exists vault;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  create type public.app_role as enum ('user', 'moderator', 'admin');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.globelink_catalog_current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role::text = 'admin'
  )
$$;
revoke all on function public.globelink_catalog_current_user_is_admin() from public, anon;
grant execute on function public.globelink_catalog_current_user_is_admin() to authenticated, service_role;

create table if not exists public.catalog_search_areas (
  id uuid primary key default gen_random_uuid(),
  city text not null check (char_length(city) between 2 and 100),
  country text not null check (char_length(country) between 2 and 100),
  country_code text,
  iata_code text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null default 8000 check (radius_m between 1000 and 25000),
  priority integer not null default 100 check (priority between 1 and 1000),
  enabled boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists catalog_search_areas_city_country_uidx
  on public.catalog_search_areas (lower(city), lower(country));
create index if not exists catalog_search_areas_enabled_priority_idx
  on public.catalog_search_areas (enabled, priority, last_synced_at);

create table if not exists public.external_catalog_items (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (char_length(provider) between 2 and 40),
  external_id text not null check (char_length(external_id) between 1 and 180),
  kind text not null check (kind in ('activity', 'restaurant', 'hotel', 'deal')),
  slug text not null check (char_length(slug) between 2 and 220),
  title text not null check (char_length(title) between 2 and 180),
  description text,
  category text,
  city text,
  country text,
  country_code text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  image_url text,
  source_url text not null,
  booking_url text,
  price_amount numeric(12,2),
  currency text,
  price_text text,
  rating numeric(3,2),
  reviews_count integer not null default 0 check (reviews_count >= 0),
  opening_hours text,
  tags jsonb not null default '{}'::jsonb,
  area_id uuid references public.catalog_search_areas(id) on delete set null,
  fetched_at timestamptz not null default now(),
  source_updated_at timestamptz,
  valid_until timestamptz,
  published boolean not null default true,
  admin_hidden boolean not null default false,
  hidden_reason text,
  hidden_by uuid references auth.users(id) on delete set null,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create unique index if not exists external_catalog_items_slug_uidx
  on public.external_catalog_items(slug);
create index if not exists external_catalog_items_public_idx
  on public.external_catalog_items(kind, published, admin_hidden, valid_until, fetched_at desc);
create index if not exists external_catalog_items_location_idx
  on public.external_catalog_items(country, city);
create index if not exists external_catalog_items_area_idx
  on public.external_catalog_items(area_id);

create table if not exists public.external_catalog_blocks (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  kind text not null check (kind in ('activity', 'restaurant', 'hotel', 'deal')),
  title text,
  reason text,
  blocked_by uuid references auth.users(id) on delete set null,
  blocked_at timestamptz not null default now(),
  unique (provider, external_id)
);

create table if not exists public.catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed', 'skipped')),
  trigger_source text not null default 'unknown',
  areas_count integer not null default 0,
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists catalog_sync_runs_started_idx on public.catalog_sync_runs(started_at desc);

alter table public.catalog_search_areas enable row level security;
alter table public.external_catalog_items enable row level security;
alter table public.external_catalog_blocks enable row level security;
alter table public.catalog_sync_runs enable row level security;

revoke all on public.catalog_search_areas from anon, authenticated;
revoke all on public.external_catalog_items from anon, authenticated;
revoke all on public.external_catalog_blocks from anon, authenticated;
revoke all on public.catalog_sync_runs from anon, authenticated;

grant select on public.external_catalog_items to anon;
grant select, update, delete on public.external_catalog_items to authenticated;
grant select, insert, update, delete on public.catalog_search_areas to authenticated;
grant select, insert, update, delete on public.external_catalog_blocks to authenticated;
grant select on public.catalog_sync_runs to authenticated;
grant all on public.catalog_search_areas, public.external_catalog_items, public.external_catalog_blocks, public.catalog_sync_runs to service_role;

drop policy if exists "public reads visible external catalog" on public.external_catalog_items;
drop policy if exists "admins manage external catalog items" on public.external_catalog_items;
create policy "public reads visible external catalog"
  on public.external_catalog_items for select to anon, authenticated
  using (
    published = true
    and admin_hidden = false
    and (valid_until is null or valid_until > now())
  );
create policy "admins manage external catalog items"
  on public.external_catalog_items for all to authenticated
  using (public.globelink_catalog_current_user_is_admin())
  with check (public.globelink_catalog_current_user_is_admin());

drop policy if exists "admins read catalog areas" on public.catalog_search_areas;
drop policy if exists "admins manage catalog areas" on public.catalog_search_areas;
create policy "admins manage catalog areas"
  on public.catalog_search_areas for all to authenticated
  using (public.globelink_catalog_current_user_is_admin())
  with check (public.globelink_catalog_current_user_is_admin());

drop policy if exists "admins read sync runs" on public.catalog_sync_runs;
create policy "admins read sync runs"
  on public.catalog_sync_runs for select to authenticated
  using (public.globelink_catalog_current_user_is_admin());

drop policy if exists "admins read blocks" on public.external_catalog_blocks;
drop policy if exists "admins manage catalog blocks" on public.external_catalog_blocks;
create policy "admins manage catalog blocks"
  on public.external_catalog_blocks for all to authenticated
  using (public.globelink_catalog_current_user_is_admin())
  with check (public.globelink_catalog_current_user_is_admin());

create or replace function public.set_catalog_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_catalog_search_areas_updated_at on public.catalog_search_areas;
create trigger set_catalog_search_areas_updated_at
before update on public.catalog_search_areas
for each row execute function public.set_catalog_updated_at();

drop trigger if exists set_external_catalog_items_updated_at on public.external_catalog_items;
create trigger set_external_catalog_items_updated_at
before update on public.external_catalog_items
for each row execute function public.set_catalog_updated_at();

create or replace function public.cleanup_stale_external_catalog()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.external_catalog_items
   where admin_hidden = false
     and (
       (kind = 'deal' and coalesce(valid_until, fetched_at + interval '2 days') < now())
       or (kind <> 'deal' and fetched_at < now() - interval '45 days')
     );
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.cleanup_stale_external_catalog() from public, anon, authenticated;
grant execute on function public.cleanup_stale_external_catalog() to service_role;

insert into public.catalog_search_areas
  (city, country, country_code, iata_code, latitude, longitude, radius_m, priority)
values
  ('Lyon', 'France', 'FR', 'LYS', 45.7640, 4.8357, 9000, 10),
  ('Paris', 'France', 'FR', 'PAR', 48.8566, 2.3522, 11000, 20),
  ('Barcelone', 'Espagne', 'ES', 'BCN', 41.3874, 2.1686, 9000, 30),
  ('Lisbonne', 'Portugal', 'PT', 'LIS', 38.7223, -9.1393, 9000, 40),
  ('Marrakech', 'Maroc', 'MA', 'RAK', 31.6295, -7.9811, 10000, 50),
  ('Rome', 'Italie', 'IT', 'ROM', 41.9028, 12.4964, 10000, 60),
  ('Tokyo', 'Japon', 'JP', 'TYO', 35.6762, 139.6503, 12000, 70),
  ('Bali', 'Indonesie', 'ID', 'DPS', -8.4095, 115.1889, 18000, 80)
on conflict do nothing;

create or replace function public.configure_catalog_daily_cron(
  p_project_url text,
  p_publishable_key text,
  p_sync_secret text,
  p_schedule text default '15 4 * * *'
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, cron, net
as $$
declare
  v_id uuid;
  v_job_id bigint;
  v_command text;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'service role required';
  end if;
  if p_project_url !~ '^https://[a-z0-9-]+\.supabase\.co$' then
    raise exception 'invalid project url';
  end if;
  if char_length(p_publishable_key) < 20 or char_length(p_sync_secret) < 24 then
    raise exception 'invalid secret material';
  end if;
  if p_schedule <> '15 4 * * *' then
    raise exception 'only the fixed daily schedule is allowed';
  end if;

  select id into v_id from vault.decrypted_secrets where name = 'globelink_catalog_project_url' limit 1;
  if v_id is null then
    perform vault.create_secret(p_project_url, 'globelink_catalog_project_url', 'GlobeLink daily catalog project URL');
  else
    perform vault.update_secret(v_id, p_project_url, 'globelink_catalog_project_url', 'GlobeLink daily catalog project URL');
  end if;

  select id into v_id from vault.decrypted_secrets where name = 'globelink_catalog_publishable_key' limit 1;
  if v_id is null then
    perform vault.create_secret(p_publishable_key, 'globelink_catalog_publishable_key', 'GlobeLink daily catalog publishable key');
  else
    perform vault.update_secret(v_id, p_publishable_key, 'globelink_catalog_publishable_key', 'GlobeLink daily catalog publishable key');
  end if;

  select id into v_id from vault.decrypted_secrets where name = 'globelink_catalog_sync_secret' limit 1;
  if v_id is null then
    perform vault.create_secret(p_sync_secret, 'globelink_catalog_sync_secret', 'GlobeLink daily catalog synchronization secret');
  else
    perform vault.update_secret(v_id, p_sync_secret, 'globelink_catalog_sync_secret', 'GlobeLink daily catalog synchronization secret');
  end if;

  select jobid into v_job_id from cron.job where jobname = 'globelink-daily-catalog' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  v_command := $command$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_project_url') || '/functions/v1/sync-travel-catalog',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_publishable_key'),
        'x-catalog-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_sync_secret')
      ),
      body := jsonb_build_object('triggerSource', 'cron'),
      timeout_milliseconds := 120000
    ) as request_id;
  $command$;

  select cron.schedule('globelink-daily-catalog', p_schedule, v_command) into v_job_id;
  return v_job_id;
end;
$$;
revoke all on function public.configure_catalog_daily_cron(text, text, text, text) from public, anon, authenticated;
grant execute on function public.configure_catalog_daily_cron(text, text, text, text) to service_role;

do $$
begin
  if to_regclass('public.places') is not null then
    execute 'revoke select on table public.places from public, anon, authenticated';

    if not exists (
      select 1
      from unnest(array[
        'id',
        'name',
        'category',
        'country',
        'city',
        'lat',
        'lng',
        'description',
        'image_url',
        'created_at',
        'moderation_status',
        'moderation_reviewed_at',
        'moderation_rejection_reason'
      ]) as required(column_name)
      where not exists (
        select 1
        from information_schema.columns as c
        where c.table_schema = 'public'
          and c.table_name = 'places'
          and c.column_name = required.column_name
      )
    ) then
      execute 'grant select (
        id,
        name,
        category,
        country,
        city,
        lat,
        lng,
        description,
        image_url,
        created_at,
        moderation_status,
        moderation_reviewed_at,
        moderation_rejection_reason
      ) on table public.places to anon, authenticated';
    end if;

    execute 'grant select on table public.places to service_role';

    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'places'
    ) then
      alter publication supabase_realtime drop table public.places;
    end if;
  end if;
end;
$$;

-- V11.0.1 Travel Match repair: likes notify immediately; mutual likes create
-- notifications for both users and open the existing direct conversation.
-- GlobeLink V11.0.1 — Travel Match notifications + reliable inbox handoff.
-- Uses the existing notification_type='like' enum value with metadata so this
-- remains compatible with already-provisioned databases.


-- Phase 2 hotfix: anonymous signup may check a username without reading profiles.
-- Only a boolean is exposed; no hidden/unverified profile data leaves the database.
create or replace function public.is_username_available(_username text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when _username is null
      or btrim(_username) !~ '^[A-Za-z0-9_]{3,24}$'
      or lower(btrim(_username)) in ('admin','support','globelink','moderator','moderateur')
      then false
    else not exists (
      select 1 from public.profiles where lower(username) = lower(btrim(_username))
    )
  end
$$;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated, service_role;

create or replace function public.send_match_like(_from_user_id uuid, _to_user_id uuid)
returns table(matched boolean, conversation_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_or_existing uuid;
  inserted_rows integer := 0;
begin
  if (select auth.uid()) is null
     or (select auth.uid()) <> _from_user_id
     or not public.current_user_email_verified() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if _from_user_id is null or _to_user_id is null or _from_user_id = _to_user_id then
    return query select false, null::uuid;
    return;
  end if;

  if not exists (
    select 1 from public.profiles
    where id = _to_user_id and email_verified_at is not null and status = 'active'
  ) then
    raise exception 'Target profile not found' using errcode = 'P0002';
  end if;

  insert into public.match_likes (from_user_id, to_user_id)
  values (_from_user_id, _to_user_id)
  on conflict (from_user_id, to_user_id) do nothing;
  get diagnostics inserted_rows = row_count;

  -- Notify the liked traveler immediately, once per real like.
  if inserted_rows > 0 then
    insert into public.notifications (recipient_id, actor_id, type, metadata)
    values (
      _to_user_id,
      _from_user_id,
      'like',
      jsonb_build_object(
        'scope', 'travel_match',
        'event', 'like',
        'from_user_id', _from_user_id,
        'to_user_id', _to_user_id
      )
    );
  end if;

  if not exists (
    select 1 from public.match_likes
    where from_user_id = _to_user_id and to_user_id = _from_user_id
  ) then
    return query select false, null::uuid;
    return;
  end if;

  created_or_existing := public.open_or_create_direct_conversation(_to_user_id);

  -- The second unique like establishes the match. Notify BOTH travelers and
  -- attach the direct conversation so the notification opens Messages.
  if inserted_rows > 0 then
    insert into public.notifications (recipient_id, actor_id, type, metadata)
    values
      (
        _from_user_id,
        _to_user_id,
        'like',
        jsonb_build_object(
          'scope', 'travel_match',
          'event', 'match',
          'conversation_id', created_or_existing,
          'other_user_id', _to_user_id
        )
      ),
      (
        _to_user_id,
        _from_user_id,
        'like',
        jsonb_build_object(
          'scope', 'travel_match',
          'event', 'match',
          'conversation_id', created_or_existing,
          'other_user_id', _from_user_id
        )
      );
  end if;

  return query select true, created_or_existing;
end;
$$;

revoke all on function public.send_match_like(uuid, uuid) from public, anon;
grant execute on function public.send_match_like(uuid, uuid) to authenticated, service_role;


notify pgrst, 'reload schema';

commit;
