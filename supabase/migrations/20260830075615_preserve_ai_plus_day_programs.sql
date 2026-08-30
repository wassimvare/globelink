-- Preserve per-day IA+ programs when a later IA+ action only updates part of a trip.
-- The server currently replaces IA+ · Jour* rows before inserting the newly generated dates.
-- We keep one hidden archive per date so an untouched day can still be rendered, and we
-- normalize the visible day number from the trip start date instead of the partial payload index.

create or replace function public.globelink_normalize_ai_plus_day_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_starts_on date;
  v_day_number integer;
begin
  if new.kind <> 'note'
     or new.title not like 'IA+ · Jour%'
     or new.visited_on is null then
    return new;
  end if;

  select starts_on
    into v_starts_on
    from public.trips
   where id = new.trip_id
     and user_id = new.user_id;

  if v_starts_on is null then
    return new;
  end if;

  v_day_number := (new.visited_on - v_starts_on) + 1;
  if v_day_number < 1 or v_day_number > 366 then
    return new;
  end if;

  new.title := 'IA+ · Jour ' || v_day_number::text;
  new.position := -100 + (v_day_number - 1);
  return new;
end;
$$;

revoke all on function public.globelink_normalize_ai_plus_day_entry() from public, anon, authenticated;

drop trigger if exists globelink_normalize_ai_plus_day_entry_trigger on public.trip_entries;
create trigger globelink_normalize_ai_plus_day_entry_trigger
before insert or update of title, visited_on, kind on public.trip_entries
for each row
execute function public.globelink_normalize_ai_plus_day_entry();

create or replace function public.globelink_archive_ai_plus_day_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.kind <> 'note'
     or old.title not like 'IA+ · Jour%'
     or old.visited_on is null then
    return old;
  end if;

  -- Keep only the most recent archived plan for a given trip date.
  delete from public.trip_entries
   where trip_id = old.trip_id
     and user_id = old.user_id
     and visited_on = old.visited_on
     and kind = 'note'
     and title = 'IA+ · Archive programme';

  insert into public.trip_entries (
    trip_id,
    user_id,
    title,
    city,
    country,
    lat,
    lng,
    notes,
    image_url,
    visited_on,
    position,
    kind,
    media_urls,
    price_level,
    rating,
    starts_at,
    video_url
  ) values (
    old.trip_id,
    old.user_id,
    'IA+ · Archive programme',
    old.city,
    old.country,
    old.lat,
    old.lng,
    old.notes,
    old.image_url,
    old.visited_on,
    -1000,
    old.kind,
    old.media_urls,
    old.price_level,
    old.rating,
    old.starts_at,
    old.video_url
  );

  return old;
end;
$$;

revoke all on function public.globelink_archive_ai_plus_day_before_delete() from public, anon, authenticated;

drop trigger if exists globelink_archive_ai_plus_day_before_delete_trigger on public.trip_entries;
create trigger globelink_archive_ai_plus_day_before_delete_trigger
before delete on public.trip_entries
for each row
execute function public.globelink_archive_ai_plus_day_before_delete();
