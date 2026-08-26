alter table public.trip_entries
  add column if not exists kind text not null default 'activity',
  add column if not exists media_urls text[] not null default '{}'::text[],
  add column if not exists price_level integer,
  add column if not exists rating numeric,
  add column if not exists starts_at timestamptz,
  add column if not exists video_url text;

create index if not exists trip_entries_trip_day_position_idx
  on public.trip_entries (trip_id, visited_on, position);

create index if not exists trip_entries_trip_kind_idx
  on public.trip_entries (trip_id, kind);

-- Rejoue la synchronisation pour les anciens plans IA+ qui avaient été
-- enregistrés dans les notes avant que les journées structurées existent.
update public.trips t
   set notes = coalesce(t.notes, '') || E'\n'
 where coalesce(t.notes, '') like '%## ✨ IA+ ·%'
   and not exists (
     select 1
       from public.trip_days d
      where d.trip_id = t.id
   );