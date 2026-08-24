-- GlobeLink V9.6.4
-- Adds a lightweight poster visible immediately while a story video starts.
-- New heavy videos are stored as directly playable 30-second objects by the client.

alter table public.stories
  add column if not exists poster_url text;

comment on column public.stories.poster_url is
  'Optional lightweight preview image displayed while the story video is buffering.';

drop function if exists public.get_visible_stories();

create function public.get_visible_stories()
returns table (
  id uuid,
  user_id uuid,
  media_url text,
  poster_url text,
  media_chunks text[],
  media_mime_type text,
  media_size_bytes bigint,
  media_type text,
  city text,
  country text,
  created_at timestamptz,
  expires_at timestamptz,
  username text,
  avatar_url text,
  story_group_id uuid,
  segment_index integer,
  segment_count integer,
  segment_start_seconds double precision,
  segment_end_seconds double precision,
  video_duration_seconds double precision
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    visible.id,
    visible.user_id,
    visible.media_url,
    visible.poster_url,
    visible.media_chunks,
    visible.media_mime_type,
    visible.media_size_bytes,
    visible.media_type,
    visible.city,
    visible.country,
    visible.created_at,
    visible.expires_at,
    visible.username,
    visible.avatar_url,
    visible.story_group_id,
    visible.segment_index,
    visible.segment_count,
    visible.segment_start_seconds,
    visible.segment_end_seconds,
    visible.video_duration_seconds
  from (
    select
      s.id,
      s.user_id,
      s.media_url,
      s.poster_url,
      s.media_chunks,
      s.media_mime_type,
      s.media_size_bytes,
      s.media_type,
      s.city,
      s.country,
      s.created_at,
      s.expires_at,
      p.username,
      p.avatar_url,
      s.story_group_id,
      s.segment_index,
      s.segment_count,
      s.segment_start_seconds,
      s.segment_end_seconds,
      s.video_duration_seconds,
      max(s.created_at) over (partition by s.user_id) as user_latest_story_at
    from public.stories s
    join public.profiles p on p.id = s.user_id
    where auth.uid() is not null
      and s.expires_at > now()
      and (
        s.user_id = auth.uid()
        or public.current_user_is_staff()
        or exists (
          select 1
          from public.follows f
          where f.follower_id = auth.uid()
            and f.following_id = s.user_id
        )
      )
  ) visible
  order by
    visible.user_latest_story_at desc,
    visible.user_id,
    visible.created_at asc,
    coalesce(visible.story_group_id, visible.id),
    visible.segment_index asc,
    visible.id asc
  limit 300;
$$;

revoke all on function public.get_visible_stories() from public, anon;
grant execute on function public.get_visible_stories() to authenticated;
