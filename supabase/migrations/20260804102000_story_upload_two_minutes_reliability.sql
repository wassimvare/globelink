-- GlobeLink V9.5.9
-- Confirme l'absence de plafond de taille du bucket et la limite métier de 2 minutes.

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
