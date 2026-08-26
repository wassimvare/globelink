-- Owner-scoped deletion for user content.
-- The historical v8_verified_delete_* policies only checked email verification.
-- Because PostgreSQL combines permissive RLS policies with OR, those policies
-- could broaden DELETE access beyond the row owner. Keep the dedicated owner/
-- sender policies and remove the broad verification-only DELETE policies.

begin;

drop policy if exists "v8_verified_delete_trips" on public.trips;
drop policy if exists "v8_verified_delete_posts" on public.posts;
drop policy if exists "v8_verified_delete_stories" on public.stories;
drop policy if exists "v8_verified_delete_messages" on public.messages;

-- Explicitly preserve the intended owner/sender policies if an older database
-- is missing one of them.
drop policy if exists "Users delete own trips" on public.trips;
create policy "Users delete own trips"
  on public.trips for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Owners or moderators delete posts" on public.posts;
create policy "Owners or moderators delete posts"
  on public.posts for delete to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_moderator_or_admin((select auth.uid()))
  );

drop policy if exists "Users delete own stories" on public.stories;
create policy "Users delete own stories"
  on public.stories for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "sender deletes message" on public.messages;
create policy "sender deletes message"
  on public.messages for delete to authenticated
  using ((select auth.uid()) = sender_id);

commit;
