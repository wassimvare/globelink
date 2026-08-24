-- GlobeLink V10.1: final database security and performance completion.
-- The migration is idempotent and is safe to run after the V10 hardening.

begin;

-- ---------------------------------------------------------------------------
-- 1. Keep internal SECURITY DEFINER helpers out of the public RPC surface.
-- They remain usable from RLS policies and trusted functions, but browsers
-- cannot invoke them directly to enumerate roles or bypass an intended flow.
-- ---------------------------------------------------------------------------

revoke all on function public.current_user_email_verified() from public, anon, authenticated;
revoke all on function public.current_user_is_staff() from public, anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.is_admin(uuid) from public, anon, authenticated;
revoke all on function public.is_conversation_participant(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_match_group_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_moderator_or_admin(uuid) from public, anon, authenticated;
revoke all on function public.is_public_profile(uuid) from public, anon, authenticated;
revoke all on function public.has_active_ai_pro_access(uuid) from public, anon, authenticated;

grant execute on function public.current_user_email_verified() to service_role;
grant execute on function public.current_user_is_staff() to service_role;
grant execute on function public.has_role(uuid, public.app_role) to service_role;
grant execute on function public.is_admin(uuid) to service_role;
grant execute on function public.is_conversation_participant(uuid, uuid) to service_role;
grant execute on function public.is_match_group_member(uuid, uuid) to service_role;
grant execute on function public.is_moderator_or_admin(uuid) to service_role;
grant execute on function public.is_public_profile(uuid) to service_role;
grant execute on function public.has_active_ai_pro_access(uuid) to service_role;

-- The four RPCs below are deliberate authenticated entry points. Each checks
-- auth.uid() and/or the caller's role inside its SECURITY DEFINER body.
revoke all on function public.admin_set_ai_pro_grant(uuid, text, integer, text)
  from public, anon;
grant execute on function public.admin_set_ai_pro_grant(uuid, text, integer, text)
  to authenticated, service_role;
revoke all on function public.get_visible_stories() from public, anon;
grant execute on function public.get_visible_stories() to authenticated, service_role;
revoke all on function public.open_or_create_direct_conversation(uuid) from public, anon;
grant execute on function public.open_or_create_direct_conversation(uuid)
  to authenticated, service_role;
revoke all on function public.send_match_like(uuid, uuid) from public, anon;
grant execute on function public.send_match_like(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Make direct conversations deterministic and race-safe.
-- ---------------------------------------------------------------------------

create or replace function public.open_or_create_direct_conversation(_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := (select auth.uid());
  existing_conv uuid;
  created_conv uuid;
  lock_key text;
begin
  if current_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if _other_user_id is null or _other_user_id = current_user_id then
    raise exception 'Invalid target profile' using errcode = '22023';
  end if;
  if not public.current_user_email_verified() then
    raise exception 'Email verification required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id and email_verified_at is not null and status = 'active'
  ) then
    raise exception 'Current profile is not active' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = _other_user_id and email_verified_at is not null and status = 'active'
  ) then
    raise exception 'Target profile not found' using errcode = 'P0002';
  end if;

  lock_key := least(current_user_id::text, _other_user_id::text)
    || ':' || greatest(current_user_id::text, _other_user_id::text);
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));

  select cp1.conversation_id into existing_conv
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp2.conversation_id = cp1.conversation_id
  where cp1.user_id = current_user_id
    and cp2.user_id = _other_user_id
    and (
      select count(*) from public.conversation_participants members
      where members.conversation_id = cp1.conversation_id
    ) = 2
  order by cp1.joined_at desc
  limit 1;

  if existing_conv is not null then
    return existing_conv;
  end if;

  insert into public.conversations default values returning id into created_conv;
  insert into public.conversation_participants (conversation_id, user_id)
  values (created_conv, current_user_id), (created_conv, _other_user_id)
  on conflict (conversation_id, user_id) do nothing;
  return created_conv;
end;
$$;

create or replace function public.send_match_like(_from_user_id uuid, _to_user_id uuid)
returns table(matched boolean, conversation_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_or_existing uuid;
begin
  if (select auth.uid()) is null
     or (select auth.uid()) <> _from_user_id
     or not public.current_user_email_verified() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if _from_user_id is null or _to_user_id is null or _from_user_id = _to_user_id then
    return query select false, null::uuid;
    return;
  end if;
  if not exists (
    select 1 from public.profiles
    where id = _to_user_id and email_verified_at is not null and status = 'active'
  ) then
    raise exception 'Target profile not found' using errcode = 'P0002';
  end if;

  insert into public.match_likes (from_user_id, to_user_id)
  values (_from_user_id, _to_user_id)
  on conflict (from_user_id, to_user_id) do nothing;

  if not exists (
    select 1 from public.match_likes
    where from_user_id = _to_user_id and to_user_id = _from_user_id
  ) then
    return query select false, null::uuid;
    return;
  end if;

  created_or_existing := public.open_or_create_direct_conversation(_to_user_id);
  return query select true, created_or_existing;
end;
$$;

revoke all on function public.open_or_create_direct_conversation(uuid) from public, anon;
grant execute on function public.open_or_create_direct_conversation(uuid)
  to authenticated, service_role;
revoke all on function public.send_match_like(uuid, uuid) from public, anon;
grant execute on function public.send_match_like(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Authenticated AI metering. Free AI endpoints are no longer anonymous and
-- each feature records bounded, user-owned usage rows.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can meter only their own AI usage" on public.ai_usage;
create policy "Users can meter only their own AI usage"
on public.ai_usage for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    (feature = 'ai_pro' and query_chars between 0 and 3000 and source_count between 0 and 10)
    or (feature = 'ai_trip' and query_chars between 0 and 1000 and source_count = 0)
    or (feature = 'chat' and query_chars between 0 and 28000 and source_count = 0)
  )
);

-- ---------------------------------------------------------------------------
-- 4. Private Realtime authorization for WebRTC call Broadcast channels.
-- Recipients can only subscribe to their own topic. Only signed-in clients can
-- publish call events; the application additionally verifies direct-conversation
-- membership before accepting an incoming invitation.
-- ---------------------------------------------------------------------------

drop policy if exists "GlobeLink call recipients receive" on realtime.messages;
create policy "GlobeLink call recipients receive"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) = 'globelink-call-user-' || (select auth.uid())::text
);

drop policy if exists "GlobeLink authenticated callers send" on realtime.messages;
create policy "GlobeLink authenticated callers send"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and (select realtime.topic()) like 'globelink-call-user-%'
);

-- ---------------------------------------------------------------------------
-- 5. Optimize every historical RLS policy that still evaluates auth.uid() or
-- auth.jwt() once per row. Already optimized scalar subqueries are untouched.
-- ---------------------------------------------------------------------------

do $$
declare
  policy_row record;
  optimized_expression text;
begin
  for policy_row in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
  loop
    if policy_row.qual is not null then
      optimized_expression := policy_row.qual;
      if optimized_expression like '%auth.uid()%'
         and optimized_expression not ilike '%select auth.uid()%' then
        optimized_expression := replace(
          optimized_expression,
          'auth.uid()',
          '(select auth.uid())'
        );
      end if;
      if optimized_expression like '%auth.jwt()%'
         and optimized_expression not ilike '%select auth.jwt()%' then
        optimized_expression := replace(
          optimized_expression,
          'auth.jwt()',
          '(select auth.jwt())'
        );
      end if;
      if optimized_expression is distinct from policy_row.qual then
        execute format(
          'alter policy %I on %I.%I using (%s)',
          policy_row.policyname,
          policy_row.schemaname,
          policy_row.tablename,
          optimized_expression
        );
      end if;
    end if;

    if policy_row.with_check is not null then
      optimized_expression := policy_row.with_check;
      if optimized_expression like '%auth.uid()%'
         and optimized_expression not ilike '%select auth.uid()%' then
        optimized_expression := replace(
          optimized_expression,
          'auth.uid()',
          '(select auth.uid())'
        );
      end if;
      if optimized_expression like '%auth.jwt()%'
         and optimized_expression not ilike '%select auth.jwt()%' then
        optimized_expression := replace(
          optimized_expression,
          'auth.jwt()',
          '(select auth.jwt())'
        );
      end if;
      if optimized_expression is distinct from policy_row.with_check then
        execute format(
          'alter policy %I on %I.%I with check (%s)',
          policy_row.policyname,
          policy_row.schemaname,
          policy_row.tablename,
          optimized_expression
        );
      end if;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Merge overlapping permissive policies. This keeps the same authorization
-- rules while avoiding repeated policy evaluation for each returned row.
-- ---------------------------------------------------------------------------

drop policy if exists "Admins can read AI admin grants" on public.ai_admin_grants;
drop policy if exists "Users can read their AI admin grant" on public.ai_admin_grants;
drop policy if exists "AI grants readable by owner or admin" on public.ai_admin_grants;
create policy "AI grants readable by owner or admin"
on public.ai_admin_grants for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);

drop policy if exists "admins read all announcements" on public.announcements;
drop policy if exists "admins write announcements" on public.announcements;
drop policy if exists "read active announcements" on public.announcements;
drop policy if exists "Announcements readable when active or by admin" on public.announcements;
drop policy if exists "Admins insert announcements" on public.announcements;
drop policy if exists "Admins update announcements" on public.announcements;
drop policy if exists "Admins delete announcements" on public.announcements;
create policy "Announcements readable when active or by admin"
on public.announcements for select to authenticated
using (
  public.is_admin((select auth.uid()))
  or (
    published_at is not null
    and published_at <= now()
    and (expires_at is null or expires_at > now())
    and (
      audience = 'all'
      or (audience = 'moderators' and public.is_moderator_or_admin((select auth.uid())))
      or (audience = 'admins' and public.is_admin((select auth.uid())))
    )
  )
);
create policy "Admins insert announcements"
on public.announcements for insert to authenticated
with check (public.is_admin((select auth.uid())));
create policy "Admins update announcements"
on public.announcements for update to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));
create policy "Admins delete announcements"
on public.announcements for delete to authenticated
using (public.is_admin((select auth.uid())));

drop policy if exists "Users delete own comments" on public.comments;
drop policy if exists "mods delete comments" on public.comments;
drop policy if exists "Owners or moderators delete comments" on public.comments;
create policy "Owners or moderators delete comments"
on public.comments for delete to authenticated
using (
  user_id = (select auth.uid())
  or public.is_moderator_or_admin((select auth.uid()))
);

drop policy if exists "Users manage own media" on public.post_media;
drop policy if exists "Owners insert post media" on public.post_media;
drop policy if exists "Owners update post media" on public.post_media;
drop policy if exists "Owners delete post media" on public.post_media;
create policy "Owners insert post media"
on public.post_media for insert to authenticated
with check (
  exists (
    select 1 from public.posts p
    where p.id = post_media.post_id and p.user_id = (select auth.uid())
  )
);
create policy "Owners update post media"
on public.post_media for update to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_media.post_id and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.posts p
    where p.id = post_media.post_id and p.user_id = (select auth.uid())
  )
);
create policy "Owners delete post media"
on public.post_media for delete to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_media.post_id and p.user_id = (select auth.uid())
  )
);

drop policy if exists "users manage own reactions" on public.post_reactions;
drop policy if exists "Users insert own reactions" on public.post_reactions;
drop policy if exists "Users update own reactions" on public.post_reactions;
drop policy if exists "Users delete own reactions" on public.post_reactions;
create policy "Users insert own reactions"
on public.post_reactions for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users update own reactions"
on public.post_reactions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users delete own reactions"
on public.post_reactions for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users delete own posts" on public.posts;
drop policy if exists "mods delete posts" on public.posts;
drop policy if exists "Owners or moderators delete posts" on public.posts;
create policy "Owners or moderators delete posts"
on public.posts for delete to authenticated
using (
  user_id = (select auth.uid())
  or public.is_moderator_or_admin((select auth.uid()))
);

drop policy if exists "Users update own posts" on public.posts;
drop policy if exists "mods update posts" on public.posts;
drop policy if exists "Owners or moderators update posts" on public.posts;
create policy "Owners or moderators update posts"
on public.posts for update to authenticated
using (
  user_id = (select auth.uid())
  or public.is_moderator_or_admin((select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  or public.is_moderator_or_admin((select auth.uid()))
);

drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "admins manage profiles" on public.profiles;
drop policy if exists "Owners or admins insert profiles" on public.profiles;
drop policy if exists "Owners or admins update profiles" on public.profiles;
drop policy if exists "Admins delete profiles" on public.profiles;
create policy "Owners or admins insert profiles"
on public.profiles for insert to authenticated
with check (
  id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);
create policy "Owners or admins update profiles"
on public.profiles for update to authenticated
using (
  id = (select auth.uid())
  or public.is_admin((select auth.uid()))
)
with check (
  id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);
create policy "Admins delete profiles"
on public.profiles for delete to authenticated
using (public.is_admin((select auth.uid())));

drop policy if exists "Own intents: full access" on public.travel_intents;
drop policy if exists "Public intents: read" on public.travel_intents;
drop policy if exists "Public or own travel intents readable" on public.travel_intents;
drop policy if exists "Owners insert travel intents" on public.travel_intents;
drop policy if exists "Owners update travel intents" on public.travel_intents;
drop policy if exists "Owners delete travel intents" on public.travel_intents;
create policy "Public or own travel intents readable"
on public.travel_intents for select to authenticated
using (visibility = 'public' or user_id = (select auth.uid()));
create policy "Owners insert travel intents"
on public.travel_intents for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "Owners update travel intents"
on public.travel_intents for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy "Owners delete travel intents"
on public.travel_intents for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "admins manage roles" on public.user_roles;
drop policy if exists "read own roles" on public.user_roles;
drop policy if exists "Roles readable by owner or admin" on public.user_roles;
drop policy if exists "Admins insert roles" on public.user_roles;
drop policy if exists "Admins update roles" on public.user_roles;
drop policy if exists "Admins delete roles" on public.user_roles;
create policy "Roles readable by owner or admin"
on public.user_roles for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);
create policy "Admins insert roles"
on public.user_roles for insert to authenticated
with check (public.is_admin((select auth.uid())));
create policy "Admins update roles"
on public.user_roles for update to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));
create policy "Admins delete roles"
on public.user_roles for delete to authenticated
using (public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- 7. Add covering indexes for every foreign key that still lacks one.
-- ---------------------------------------------------------------------------

do $$
declare
  fk record;
  index_name text;
begin
  for fk in
    select
      c.conrelid,
      n.nspname as schema_name,
      t.relname as table_name,
      c.conkey,
      string_agg(format('%I', a.attname), ', ' order by keys.ordinality) as columns_sql,
      string_agg(a.attname, '_' order by keys.ordinality) as columns_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    cross join lateral unnest(c.conkey) with ordinality as keys(attnum, ordinality)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = keys.attnum
    where c.contype = 'f'
      and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and (i.indkey::smallint[])[0:cardinality(c.conkey)-1] = c.conkey
      )
    group by c.conrelid, n.nspname, t.relname, c.conkey
  loop
    index_name := left(fk.table_name || '_' || fk.columns_name || '_fk_idx', 63);
    execute format(
      'create index if not exists %I on %I.%I (%s)',
      index_name,
      fk.schema_name,
      fk.table_name,
      fk.columns_sql
    );
  end loop;
end;
$$;

drop index if exists public.comments_post_idx;
drop index if exists public.messages_conv_idx;

-- Bound each stored object even if a browser-side limit is bypassed. Large
-- videos are already uploaded as chunks smaller than 42 MB.
update storage.buckets
set file_size_limit = 52428800
where id = 'media';

-- Constraints created NOT VALID protected new rows already. The current data
-- set is small enough to validate them now and protect future schema changes.
-- One pre-segmentation legacy video can legitimately have no duration metadata.
-- Give such rows the historical two-minute upper bound so the content is kept
-- while all future writes remain constrained.
update public.stories
set segment_end_seconds = 120,
    video_duration_seconds = 120
where media_type = 'video'
  and segment_count = 1
  and segment_index = 0
  and segment_start_seconds = 0
  and segment_end_seconds is null
  and video_duration_seconds is null;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select n.nspname as schema_name, t.relname as table_name, c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where not c.convalidated
      and c.contype = 'c'
      and n.nspname in ('public', 'storage')
  loop
    execute format(
      'alter table %I.%I validate constraint %I',
      constraint_row.schema_name,
      constraint_row.table_name,
      constraint_row.conname
    );
  end loop;
end;
$$;

commit;
