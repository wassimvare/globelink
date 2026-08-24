-- GlobeLink V10 production hardening.
-- This migration is intentionally idempotent so it can be applied after every
-- historical V8/V9 migration without depending on their intermediate state.

begin;

-- Replace deprecated auth.role() checks. The invoker role is reliable for
-- trusted server writes while auth.uid() remains the end-user identity.
create or replace function public.prevent_protected_column_changes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  column_name text;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  foreach column_name in array tg_argv loop
    if (to_jsonb(old) -> column_name) is distinct from (to_jsonb(new) -> column_name) then
      raise exception 'protected column cannot be changed: %', column_name using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

-- The historical function used SECURITY DEFINER together with current_user;
-- that makes current_user the function owner and could bypass every check.
-- SECURITY INVOKER preserves the real database role and closes that path.
create or replace function public.protect_admin_profile_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
     or public.has_role((select auth.uid()), 'admin'::public.app_role) then
    return new;
  end if;

  if new.verified is distinct from old.verified
    or new.featured is distinct from old.featured
    or new.visibility is distinct from old.visibility
    or new.ai_access is distinct from old.ai_access
    or new.ai_daily_limit is distinct from old.ai_daily_limit
    or new.status is distinct from old.status
    or new.status_reason is distinct from old.status_reason
  then
    raise exception 'admin-managed profile fields cannot be changed by this account'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Prevent ownership reassignment through UPDATE requests.
drop policy if exists "Users update own posts" on public.posts;
create policy "Users update own posts"
  on public.posts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own places" on public.places;
create policy "Users update own places"
  on public.places for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own trips" on public.trips;
create policy "Users update own trips"
  on public.trips for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "recipient updates own notifications" on public.notifications;
create policy "recipient updates own notifications"
  on public.notifications for update to authenticated
  using ((select auth.uid()) = recipient_id)
  with check ((select auth.uid()) = recipient_id);

drop policy if exists "user updates own participation" on public.conversation_participants;
create policy "user updates own participation"
  on public.conversation_participants for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Conversation membership is created by the checked server-side RPC. A client
-- may only add its own membership and cannot silently add another account.
drop policy if exists "Participants can add members" on public.conversation_participants;
drop policy if exists "user adds self or participants add others" on public.conversation_participants;
create policy "Users can add their own membership"
  on public.conversation_participants for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- last_message_at is maintained by a trusted trigger, never by a browser.
drop policy if exists "Participants update conversation" on public.conversations;
drop policy if exists "participants update conversation" on public.conversations;
revoke update on public.conversations from authenticated;

-- Purchases cannot be trusted when price/status/download URL are supplied by a
-- browser. Until a server-side checkout exists, marketplace purchase writes
-- stay service-role only. Existing purchases remain readable by their parties.
drop policy if exists "Buyer creates purchase" on public.purchases;
drop policy if exists "Buyer updates own purchase" on public.purchases;
revoke insert, update, delete on public.purchases from authenticated;

-- SECURITY DEFINER trigger functions are internal implementation details.
-- Triggers continue to execute them without granting direct API access.
revoke all on function public.refresh_product_rating() from public, anon, authenticated;
revoke all on function public.notify_on_review() from public, anon, authenticated;
revoke all on function public.refresh_product_favorites() from public, anon, authenticated;
revoke all on function public.notify_on_story_like() from public, anon, authenticated;
revoke all on function public.notify_on_comment_like() from public, anon, authenticated;
revoke all on function public.sync_profile_email_verification() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_profile_system_fields() from public, anon, authenticated;
revoke all on function public.bump_conversation_timestamp() from public, anon, authenticated;
revoke all on function public.notify_on_like() from public, anon, authenticated;
revoke all on function public.notify_on_reaction() from public, anon, authenticated;
revoke all on function public.notify_on_comment() from public, anon, authenticated;
revoke all on function public.notify_on_follow() from public, anon, authenticated;
revoke all on function public.notify_on_message() from public, anon, authenticated;
revoke all on function public.handle_follow_change() from public, anon, authenticated;
revoke all on function public.prevent_protected_column_changes() from public, anon, authenticated;
revoke all on function public.protect_admin_profile_fields() from public, anon, authenticated;
revoke all on function public.normalize_ai_subscription_source() from public, anon, authenticated;

-- RLS helper functions remain callable only by the roles that need them.
revoke all on function public.is_match_group_member(uuid, uuid) from public, anon;
grant execute on function public.is_match_group_member(uuid, uuid) to authenticated, service_role;
revoke all on function public.open_or_create_direct_conversation(uuid) from public, anon;
grant execute on function public.open_or_create_direct_conversation(uuid) to authenticated, service_role;

-- Indexes used on every ownership and conversation-policy check.
create index if not exists posts_user_created_idx on public.posts (user_id, created_at desc);
create index if not exists places_user_created_idx on public.places (user_id, created_at desc);
create index if not exists trips_user_created_idx on public.trips (user_id, created_at desc);
create index if not exists conversation_participants_user_conversation_idx
  on public.conversation_participants (user_id, conversation_id);

commit;
