create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  query_key text not null,
  search_count integer not null default 1 check (search_count > 0),
  created_at timestamptz not null default now(),
  last_searched_at timestamptz not null default now(),
  unique (user_id, query_key),
  check (char_length(query) between 2 and 200),
  check (char_length(query_key) between 2 and 200)
);

create index if not exists search_history_user_last_idx
  on public.search_history(user_id, last_searched_at desc);

alter table public.search_history enable row level security;
revoke all on table public.search_history from anon, authenticated;
grant select, insert, update, delete on table public.search_history to authenticated;

drop policy if exists "Users view own search history" on public.search_history;
create policy "Users view own search history"
  on public.search_history for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create own search history" on public.search_history;
create policy "Users create own search history"
  on public.search_history for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own search history" on public.search_history;
create policy "Users update own search history"
  on public.search_history for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own search history" on public.search_history;
create policy "Users delete own search history"
  on public.search_history for delete to authenticated
  using ((select auth.uid()) = user_id);
