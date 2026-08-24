-- GlobeLink V9.5.8
-- Répare les likes de stories et limite les vidéos à 2 minutes sans limite locale de taille.

do $$
begin
  if exists (select 1 from pg_type where typname = 'notification_type')
     and not exists (
       select 1
       from pg_type t
       join pg_enum e on e.enumtypid = t.oid
       where t.typname = 'notification_type'
         and e.enumlabel = 'story_like'
     ) then
    alter type public.notification_type add value 'story_like';
  end if;
end $$;

-- La taille n'est plus plafonnée par le bucket. Les limites globales du plan Supabase
-- et le quota de stockage du projet restent applicables.
update storage.buckets
set file_size_limit = null
where id = 'media';

alter table public.stories
  drop constraint if exists stories_segment_values_safe;

alter table public.stories
  add constraint stories_segment_values_safe check (
    segment_count between 1 and 4
    and segment_index >= 0
    and segment_index < segment_count
    and segment_start_seconds >= 0
    and segment_start_seconds <= 120
    and (
      (
        media_type = 'image'
        and segment_count = 1
        and segment_index = 0
        and segment_start_seconds = 0
        and segment_end_seconds is null
        and video_duration_seconds is null
      )
      or
      (
        media_type = 'video'
        and segment_end_seconds is not null
        and segment_end_seconds > segment_start_seconds
        and segment_end_seconds <= 120
        and video_duration_seconds is not null
        and video_duration_seconds >= segment_end_seconds
        and video_duration_seconds <= 120
      )
    )
  ) not valid;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'story_likes'
  ) then
    alter publication supabase_realtime add table public.story_likes;
  end if;
end $$;
