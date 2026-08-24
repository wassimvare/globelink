-- GlobeLink V11.0.2 — Phase 2 destination/auth hotfix
begin;

create or replace function public.is_username_available(_username text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when _username is null
      or btrim(_username) !~ '^[A-Za-z0-9_]{3,24}$'
      or lower(btrim(_username)) in ('admin','support','globelink','moderator','moderateur')
      then false
    else not exists (
      select 1 from public.profiles where lower(username) = lower(btrim(_username))
    )
  end
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated, service_role;

commit;
