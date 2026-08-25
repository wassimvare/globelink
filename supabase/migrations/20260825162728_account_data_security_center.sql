alter table public.user_settings
  add column if not exists deactivated_previous_visibility text,
  add column if not exists deactivated_previous_travel_match boolean,
  add column if not exists recommendations_reset_at timestamptz;

create table if not exists public.account_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint account_security_events_event_type_valid check (
    event_type = any (array[
      'email_change_requested'::text,
      'password_changed'::text,
      'password_reset_requested'::text,
      'other_sessions_revoked'::text,
      'all_sessions_revoked'::text,
      'session_revoked'::text,
      'data_exported'::text,
      'recommendations_reset'::text,
      'account_deactivated'::text,
      'account_reactivated'::text,
      'cache_cleared'::text
    ])
  )
);

alter table public.account_security_events enable row level security;

drop policy if exists "security_events_select_own" on public.account_security_events;
create policy "security_events_select_own"
on public.account_security_events
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.account_security_events from anon;
grant select on table public.account_security_events to authenticated;
grant all on table public.account_security_events to service_role;

create or replace function public.log_my_security_event(_event_type text, _metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _id uuid;
begin
  if _uid is null then
    raise exception 'authentication required';
  end if;

  if _event_type is null or _event_type <> all (array[
    'email_change_requested','password_changed','password_reset_requested','other_sessions_revoked',
    'all_sessions_revoked','session_revoked','data_exported','recommendations_reset',
    'account_deactivated','account_reactivated','cache_cleared'
  ]) then
    raise exception 'unsupported security event';
  end if;

  insert into public.account_security_events(user_id, event_type, metadata)
  values (_uid, _event_type, coalesce(_metadata, '{}'::jsonb))
  returning id into _id;

  return _id;
end;
$$;

create or replace function public.list_my_sessions()
returns table (
  session_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamp,
  user_agent text,
  ip text,
  aal text,
  not_after timestamptz,
  is_current boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    s.id,
    s.created_at,
    s.updated_at,
    s.refreshed_at,
    s.user_agent,
    s.ip::text,
    s.aal::text,
    s.not_after,
    s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
  from auth.sessions s
  where s.user_id = auth.uid()
  order by coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) desc;
$$;

create or replace function public.revoke_my_session(_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _current_session text := auth.jwt() ->> 'session_id';
  _deleted int := 0;
begin
  if _uid is null then
    raise exception 'authentication required';
  end if;
  if _session_id is null then
    raise exception 'session required';
  end if;
  if _current_session is not null and _session_id::text = _current_session then
    raise exception 'use local sign out for the current session';
  end if;

  delete from auth.sessions
  where id = _session_id and user_id = _uid;
  get diagnostics _deleted = row_count;

  if _deleted > 0 then
    insert into public.account_security_events(user_id, event_type, metadata)
    values (_uid, 'session_revoked', jsonb_build_object('session_id', _session_id));
  end if;

  return _deleted > 0;
end;
$$;

create or replace function public.deactivate_my_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _visibility text;
  _travel_match boolean;
begin
  if _uid is null then
    raise exception 'authentication required';
  end if;

  select p.visibility into _visibility from public.profiles p where p.id = _uid;
  select us.travel_match_enabled into _travel_match from public.user_settings us where us.user_id = _uid;

  insert into public.user_settings(
    user_id,
    deactivated_previous_visibility,
    deactivated_previous_travel_match,
    travel_match_enabled,
    updated_at
  ) values (
    _uid,
    coalesce(_visibility, 'public'),
    coalesce(_travel_match, true),
    false,
    now()
  )
  on conflict (user_id) do update set
    deactivated_previous_visibility = excluded.deactivated_previous_visibility,
    deactivated_previous_travel_match = excluded.deactivated_previous_travel_match,
    travel_match_enabled = false,
    updated_at = now();

  update public.profiles
  set status = 'deactivated',
      status_reason = 'self_deactivated',
      status_updated_at = now(),
      visibility = 'hidden',
      updated_at = now()
  where id = _uid;

  update public.travel_intents
  set visibility = 'private', updated_at = now()
  where user_id = _uid and visibility = 'public';

  insert into public.account_security_events(user_id, event_type)
  values (_uid, 'account_deactivated');

  return true;
end;
$$;

create or replace function public.reactivate_my_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _visibility text := 'public';
  _travel_match boolean := true;
begin
  if _uid is null then
    raise exception 'authentication required';
  end if;

  select
    coalesce(us.deactivated_previous_visibility, 'public'),
    coalesce(us.deactivated_previous_travel_match, true)
  into _visibility, _travel_match
  from public.user_settings us
  where us.user_id = _uid;

  update public.profiles
  set status = 'active',
      status_reason = null,
      status_updated_at = now(),
      visibility = case when _visibility in ('public','limited','hidden') then _visibility else 'public' end,
      updated_at = now()
  where id = _uid and status = 'deactivated';

  update public.user_settings
  set travel_match_enabled = _travel_match,
      deactivated_previous_visibility = null,
      deactivated_previous_travel_match = null,
      updated_at = now()
  where user_id = _uid;

  insert into public.account_security_events(user_id, event_type)
  values (_uid, 'account_reactivated');

  return true;
end;
$$;

create or replace function public.reset_my_recommendations()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'authentication required';
  end if;

  delete from public.match_likes where from_user_id = _uid;
  delete from public.match_passes where user_id = _uid;
  delete from public.search_history where user_id = _uid;

  insert into public.user_settings(user_id, travel_interests, recommendations_reset_at, updated_at)
  values (_uid, '{}'::text[], now(), now())
  on conflict (user_id) do update set
    travel_interests = '{}'::text[],
    recommendations_reset_at = now(),
    updated_at = now();

  insert into public.account_security_events(user_id, event_type)
  values (_uid, 'recommendations_reset');

  return true;
end;
$$;

revoke all on function public.log_my_security_event(text, jsonb) from public, anon;
revoke all on function public.list_my_sessions() from public, anon;
revoke all on function public.revoke_my_session(uuid) from public, anon;
revoke all on function public.deactivate_my_account() from public, anon;
revoke all on function public.reactivate_my_account() from public, anon;
revoke all on function public.reset_my_recommendations() from public, anon;

grant execute on function public.log_my_security_event(text, jsonb) to authenticated;
grant execute on function public.list_my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
grant execute on function public.deactivate_my_account() to authenticated;
grant execute on function public.reactivate_my_account() to authenticated;
grant execute on function public.reset_my_recommendations() to authenticated;
