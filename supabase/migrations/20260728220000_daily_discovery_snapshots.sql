-- One curated, server-generated discovery snapshot per UTC day.
-- The browser never writes to this table. Service-role jobs/functions own it.
create table if not exists public.daily_discovery_snapshots (
  snapshot_date date primary key,
  generated_at timestamptz not null default now(),
  status text not null default 'building' check (status in ('building', 'ready', 'failed')),
  source_count integer not null default 0 check (source_count between 0 and 50),
  payload jsonb not null default '{"items":[]}'::jsonb,
  constraint daily_discovery_payload_size check (octet_length(payload::text) <= 100000)
);

alter table public.daily_discovery_snapshots enable row level security;
revoke all on table public.daily_discovery_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.daily_discovery_snapshots to service_role;

create index if not exists daily_discovery_generated_idx
  on public.daily_discovery_snapshots (generated_at desc);

-- Retain a short audit window without growing forever.
create or replace function public.cleanup_old_daily_discovery_snapshots()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.daily_discovery_snapshots
  where snapshot_date < (current_date - interval '45 days');
$$;
revoke all on function public.cleanup_old_daily_discovery_snapshots() from public, anon, authenticated;
grant execute on function public.cleanup_old_daily_discovery_snapshots() to service_role;
