-- GlobeLink V9.6.2
-- 1) Stories are displayed chronologically for each user.
-- 2) Administrators can grant and revoke temporary AI Pro access without
--    altering Stripe subscription records.

create table if not exists public.ai_admin_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_admin_grants_expiry_safe check (expires_at > starts_at),
  constraint ai_admin_grants_note_safe check (note is null or char_length(note) <= 300)
);

alter table public.ai_admin_grants enable row level security;

revoke all on public.ai_admin_grants from anon, authenticated;
grant select on public.ai_admin_grants to authenticated;

drop policy if exists "Users can read their AI admin grant" on public.ai_admin_grants;
create policy "Users can read their AI admin grant"
on public.ai_admin_grants
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read AI admin grants" on public.ai_admin_grants;
create policy "Admins can read AI admin grants"
on public.ai_admin_grants
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

create index if not exists ai_admin_grants_active_expiry_idx
  on public.ai_admin_grants (status, expires_at);

create or replace function public.admin_set_ai_pro_grant(
  p_user_id uuid,
  p_action text,
  p_duration_days integer default 30,
  p_note text default null
)
returns table (
  status text,
  starts_at timestamptz,
  expires_at timestamptz,
  granted_by uuid,
  note text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(coalesce(p_action, ''));
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
  v_days integer := coalesce(p_duration_days, 30);
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_action = 'grant' then
    if v_days < 1 or v_days > 3650 then
      raise exception 'INVALID_DURATION';
    end if;

    insert into public.ai_admin_grants (
      user_id, granted_by, status, starts_at, expires_at, note, created_at, updated_at
    ) values (
      p_user_id, auth.uid(), 'active', now(), now() + make_interval(days => v_days), v_note, now(), now()
    )
    on conflict (user_id) do update set
      granted_by = excluded.granted_by,
      status = 'active',
      starts_at = now(),
      expires_at = now() + make_interval(days => v_days),
      note = excluded.note,
      updated_at = now();
  elsif v_action = 'revoke' then
    insert into public.ai_admin_grants (
      user_id, granted_by, status, starts_at, expires_at, note, created_at, updated_at
    ) values (
      p_user_id, auth.uid(), 'revoked', now() - interval '1 second', now(), v_note, now(), now()
    )
    on conflict (user_id) do update set
      granted_by = excluded.granted_by,
      status = 'revoked',
      expires_at = now(),
      note = excluded.note,
      updated_at = now();
  else
    raise exception 'INVALID_ACTION';
  end if;

  return query
  select g.status, g.starts_at, g.expires_at, g.granted_by, g.note
  from public.ai_admin_grants g
  where g.user_id = p_user_id;
end;
$$;

revoke all on function public.admin_set_ai_pro_grant(uuid, text, integer, text) from public, anon;
grant execute on function public.admin_set_ai_pro_grant(uuid, text, integer, text) to authenticated;

create or replace function public.has_active_ai_pro_access(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_user_id is not null
    and (
      p_user_id = auth.uid()
      or public.current_user_is_staff()
    )
    and coalesce((select p.ai_access <> 'disabled' from public.profiles p where p.id = p_user_id), false)
    and (
      exists (
        select 1
        from public.ai_subscriptions s
        where s.user_id = p_user_id
          and s.status in ('active', 'trialing')
          and (s.current_period_end is null or s.current_period_end > now())
      )
      or exists (
        select 1
        from public.ai_admin_grants g
        where g.user_id = p_user_id
          and g.status = 'active'
          and g.starts_at <= now()
          and g.expires_at > now()
      )
      or exists (
        select 1
        from public.user_roles ur
        where ur.user_id = p_user_id
          and ur.role in ('admin', 'moderator')
      )
    );
$$;

revoke all on function public.has_active_ai_pro_access(uuid) from public, anon;
grant execute on function public.has_active_ai_pro_access(uuid) to authenticated;

-- Return the newest account bubbles first, but play every account's stories
-- from the oldest publication to the newest one. Segments of a video remain
-- in their natural 1, 2, 3, 4 order.
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
    visible.id,
    visible.user_id,
    visible.media_url,
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
