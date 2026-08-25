create or replace function public.record_search_history(_query text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := (select auth.uid());
  cleaned text := regexp_replace(trim(coalesce(_query, '')), '\s+', ' ', 'g');
  key_value text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if char_length(cleaned) < 2 or char_length(cleaned) > 200 then
    return;
  end if;
  key_value := lower(cleaned);

  insert into public.search_history(user_id, query, query_key, search_count, last_searched_at)
  values (current_user_id, cleaned, key_value, 1, now())
  on conflict (user_id, query_key)
  do update set
    query = excluded.query,
    search_count = public.search_history.search_count + 1,
    last_searched_at = now();

  delete from public.search_history h
  where h.user_id = current_user_id
    and h.id in (
      select id from public.search_history
      where user_id = current_user_id
      order by last_searched_at desc
      offset 100
    );
end;
$$;

revoke all on function public.record_search_history(text) from public, anon;
grant execute on function public.record_search_history(text) to authenticated;
