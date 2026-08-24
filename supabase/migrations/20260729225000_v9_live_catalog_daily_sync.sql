-- GlobeLink V9 — catalogue internet automatique, modération admin et historique des synchronisations.
-- Les lieux proviennent de fournisseurs externes et ne doivent jamais être présentés comme des données GlobeLink vérifiées.

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

grant select on public.external_catalog_items to anon, authenticated;
grant select on public.catalog_search_areas to authenticated;
grant select on public.catalog_sync_runs to authenticated;
grant all on public.catalog_search_areas, public.external_catalog_items, public.external_catalog_blocks, public.catalog_sync_runs to service_role;

drop policy if exists "public reads visible external catalog" on public.external_catalog_items;
create policy "public reads visible external catalog"
  on public.external_catalog_items for select to anon, authenticated
  using (
    published = true
    and admin_hidden = false
    and (valid_until is null or valid_until > now())
  );

drop policy if exists "admins read catalog areas" on public.catalog_search_areas;
create policy "admins read catalog areas"
  on public.catalog_search_areas for select to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "admins read sync runs" on public.catalog_sync_runs;
create policy "admins read sync runs"
  on public.catalog_sync_runs for select to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "admins read blocks" on public.external_catalog_blocks;
create policy "admins read blocks"
  on public.external_catalog_blocks for select to authenticated
  using (public.is_admin(auth.uid()));

-- Keep updated_at coherent without trusting clients.
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

-- The synchronizer calls this once per run. It removes stale public rows while keeping admin blocks.
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

-- Default zones are real coordinates, not demo accounts or fake content.
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
  ('Bali', 'Indonésie', 'ID', 'DPS', -8.4095, 115.1889, 18000, 80)
on conflict do nothing;

-- Optional but recommended: schedule the Edge Function every day from Postgres.
-- This function is called by the Edge Function itself after an authenticated admin action.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

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
