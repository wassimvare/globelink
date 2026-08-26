create table if not exists public.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day_date date not null,
  headline text,
  notes text,
  weather_icon text,
  weather_summary text,
  weather_temp numeric,
  mood text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_days_trip_date_key unique (trip_id, day_date)
);

create index if not exists trip_days_trip_date_idx on public.trip_days (trip_id, day_date);
create index if not exists trip_days_user_idx on public.trip_days (user_id);

alter table public.trip_days enable row level security;

drop policy if exists "Owners manage trip days" on public.trip_days;
create policy "Owners manage trip days"
on public.trip_days
for all
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.trips
    where trips.id = trip_days.trip_id
      and trips.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.trips
    where trips.id = trip_days.trip_id
      and trips.user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.trip_days to authenticated;
