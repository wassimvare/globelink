begin;

-- Removing a conversation from the inbox is implemented by removing only the
-- current user's membership. The other participant keeps their own copy.
drop policy if exists "v8_verified_delete_conversation_participants"
  on public.conversation_participants;

drop policy if exists "user removes own participation"
  on public.conversation_participants;

create policy "user removes own participation"
  on public.conversation_participants
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Browsers should never delete the shared conversation record itself.
drop policy if exists "v8_verified_delete_conversations"
  on public.conversations;
revoke delete on public.conversations from authenticated;

commit;
