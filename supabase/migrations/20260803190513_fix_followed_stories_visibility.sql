drop policy if exists "Active stories viewable" on public.stories;
drop policy if exists "v8_public_owner_stories" on public.stories;
drop policy if exists "stories visible to owner followers and staff" on public.stories;

create policy "stories visible to owner followers and staff"
on public.stories
for select
to authenticated
using (
  expires_at > now()
  and (
    user_id = auth.uid()
    or public.current_user_is_staff()
    or exists (
      select 1
      from public.follows f
      where f.follower_id = auth.uid()
        and f.following_id = stories.user_id
    )
  )
);

create index if not exists follows_follower_following_idx
  on public.follows (follower_id, following_id);
create index if not exists stories_active_user_created_idx
  on public.stories (user_id, expires_at, created_at desc);

create or replace function public.get_visible_stories()
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
  avatar_url text
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
    p.avatar_url
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
  order by s.created_at desc
  limit 100;
$$;

revoke all on function public.get_visible_stories() from public;
revoke all on function public.get_visible_stories() from anon;
grant execute on function public.get_visible_stories() to authenticated;
