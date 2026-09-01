-- Avoid PostgreSQL tuple re-modification errors when IA+ replaces both the visible
-- program and its hidden archive in the same DELETE statement.
--
-- The previous BEFORE DELETE trigger archived a visible `IA+ · Jour N` row by deleting
-- the existing hidden archive. The IA+ save path can delete the visible row and the
-- archive in one bulk statement, so the trigger modified a tuple that the outer DELETE
-- still intended to process. PostgreSQL correctly rejected that command.
--
-- AFTER DELETE keeps the same one-archive-per-day behavior without mutating rows that
-- are still targets of the outer DELETE.

create or replace function public.globelink_archive_ai_plus_day_after_delete()
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

revoke all on function public.globelink_archive_ai_plus_day_after_delete() from public, anon, authenticated;

drop trigger if exists globelink_archive_ai_plus_day_before_delete_trigger on public.trip_entries;
drop trigger if exists globelink_archive_ai_plus_day_after_delete_trigger on public.trip_entries;

create trigger globelink_archive_ai_plus_day_after_delete_trigger
after delete on public.trip_entries
for each row
execute function public.globelink_archive_ai_plus_day_after_delete();
