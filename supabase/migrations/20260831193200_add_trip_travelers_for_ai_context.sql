alter table public.trips
  add column if not exists travelers integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trips_travelers_range'
      and conrelid = 'public.trips'::regclass
  ) then
    alter table public.trips
      add constraint trips_travelers_range
      check (travelers between 1 and 50);
  end if;
end
$$;
