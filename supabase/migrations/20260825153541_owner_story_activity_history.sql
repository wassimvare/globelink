drop policy if exists "Owners view own story history" on public.stories;
create policy "Owners view own story history"
  on public.stories for select to authenticated
  using ((select auth.uid()) = user_id);
