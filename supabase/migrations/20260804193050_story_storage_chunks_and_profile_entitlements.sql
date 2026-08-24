alter table public.stories
  add column if not exists media_chunks text[],
  add column if not exists media_mime_type text,
  add column if not exists media_size_bytes bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stories'::regclass
      and conname = 'stories_media_manifest_safe'
  ) then
    alter table public.stories
      add constraint stories_media_manifest_safe check (
        media_chunks is null
        or (
          cardinality(media_chunks) between 1 and 128
          and media_chunks[1] = media_url
          and media_mime_type in ('video/mp4', 'video/webm', 'video/quicktime')
          and media_size_bytes is not null
          and media_size_bytes > 0
        )
      ) not valid;
  end if;
end $$;

create index if not exists stories_media_manifest_idx
  on public.stories ((media_chunks is not null), created_at desc);

drop function if exists public.get_visible_stories();

create function public.get_visible_stories()
returns table (
  id uuid,
  user_id uuid,
  media_url text,
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
    s.id,
    s.user_id,
    s.media_url,
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

revoke all on function public.get_visible_stories() from public, anon;
grant execute on function public.get_visible_stories() to authenticated;

-- Un utilisateur ne peut plus modifier les colonnes qui accordent des droits
-- premium, de modération ou de visibilité spéciale à son propre profil.
revoke update on public.profiles from authenticated;
grant update (
  username,
  display_name,
  avatar_url,
  bio,
  country,
  languages,
  visited_countries,
  banner_url,
  city,
  birth_date,
  travel_style,
  interests,
  website_url,
  instagram,
  tiktok,
  youtube,
  x_handle,
  visibility,
  updated_at
) on public.profiles to authenticated;
