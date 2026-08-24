alter table public.stories
  add column if not exists story_group_id uuid,
  add column if not exists segment_index integer not null default 0,
  add column if not exists segment_count integer not null default 1,
  add column if not exists segment_start_seconds double precision not null default 0,
  add column if not exists segment_end_seconds double precision,
  add column if not exists video_duration_seconds double precision;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stories'::regclass
      and conname = 'stories_segment_values_safe'
  ) then
    alter table public.stories
      add constraint stories_segment_values_safe check (
        segment_count between 1 and 60
        and segment_index >= 0
        and segment_index < segment_count
        and segment_start_seconds >= 0
        and segment_start_seconds <= 1800
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
            and segment_end_seconds <= 1800
            and video_duration_seconds is not null
            and video_duration_seconds >= segment_end_seconds
            and video_duration_seconds <= 1800
          )
        )
      ) not valid;
  end if;
end $$;

create index if not exists stories_group_segments_idx
  on public.stories (story_group_id, segment_index);

create index if not exists stories_user_group_created_segments_idx
  on public.stories (user_id, created_at desc, segment_index asc);

drop function if exists public.get_visible_stories();

create function public.get_visible_stories()
returns table (
  id uuid,
  user_id uuid,
  media_url text,
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
    s.id,
    s.user_id,
    s.media_url,
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
    s.video_duration_seconds
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
  order by s.created_at desc, s.segment_index asc
  limit 300;
$$;

revoke all on function public.get_visible_stories() from public;
revoke all on function public.get_visible_stories() from anon;
grant execute on function public.get_visible_stories() to authenticated;
