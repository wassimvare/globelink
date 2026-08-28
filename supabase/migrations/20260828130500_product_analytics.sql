-- GlobeLink product analytics: privacy-minimized first-party usage signals.
-- The browser never sends email addresses, IP addresses, free-form user text or exact destination names.

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  session_id text not null,
  event_name text not null,
  route text null,
  source text not null default 'web',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint product_events_session_id_length check (char_length(session_id) between 8 and 128),
  constraint product_events_event_name_format check (event_name ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint product_events_route_length check (route is null or char_length(route) <= 300),
  constraint product_events_source_valid check (source in ('web', 'mobile-web', 'pwa')),
  constraint product_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

alter table public.product_events enable row level security;

revoke all on table public.product_events from public, anon, authenticated;
grant select, insert, update, delete on table public.product_events to service_role;

create index if not exists product_events_occurred_at_idx
  on public.product_events (occurred_at desc);
create index if not exists product_events_name_time_idx
  on public.product_events (event_name, occurred_at desc);
create index if not exists product_events_session_time_idx
  on public.product_events (session_id, occurred_at desc);
create index if not exists product_events_user_time_idx
  on public.product_events (user_id, occurred_at desc)
  where user_id is not null;

create or replace function public.record_product_event(
  p_event_name text,
  p_session_id text,
  p_route text default null,
  p_source text default 'web',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_event_name text := lower(trim(coalesce(p_event_name, '')));
  v_session_id text := left(trim(coalesce(p_session_id, '')), 128);
  v_route text := nullif(left(split_part(coalesce(p_route, ''), '?', 1), 300), '');
  v_source text := case when p_source in ('web', 'mobile-web', 'pwa') then p_source else 'web' end;
  v_metadata jsonb := '{}'::jsonb;
begin
  if v_event_name !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'invalid analytics event name' using errcode = '22023';
  end if;

  if char_length(v_session_id) < 8 then
    raise exception 'invalid analytics session id' using errcode = '22023';
  end if;

  if p_metadata is not null and jsonb_typeof(p_metadata) = 'object' then
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
      into v_metadata
    from jsonb_each(p_metadata)
    where key = any(array[
      'area', 'surface', 'kind', 'plan', 'action', 'result',
      'has_dates', 'has_budget', 'authenticated', 'device'
    ]::text[]);
  end if;

  if pg_column_size(v_metadata) > 4096 then
    v_metadata := '{}'::jsonb;
  end if;

  insert into public.product_events (
    user_id, session_id, event_name, route, source, metadata
  ) values (
    auth.uid(), v_session_id, v_event_name, v_route, v_source, v_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_product_event(text, text, text, text, jsonb) from public;
grant execute on function public.record_product_event(text, text, text, text, jsonb) to anon, authenticated, service_role;

create or replace function public.get_product_analytics_summary(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)));
  v_result jsonb;
begin
  if auth.role() <> 'service_role' and not public.has_role(auth.uid(), 'admin') then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'total_events', count(*),
    'page_views', count(*) filter (where event_name = 'page_view'),
    'unique_sessions', count(distinct session_id),
    'active_users', count(distinct user_id) filter (where user_id is not null),
    'explorer_opens', count(*) filter (where event_name = 'explorer_opened'),
    'voyage_opens', count(*) filter (where event_name = 'voyage_opened'),
    'ai_opens', count(*) filter (where event_name = 'ai_opened'),
    'travel_match_opens', count(*) filter (where event_name = 'travel_match_opened'),
    'trips_created', count(*) filter (where event_name = 'trip_created'),
    'trip_items_added', count(*) filter (where event_name = 'trip_item_added'),
    'top_events', coalesce((
      select jsonb_agg(jsonb_build_object('event', q.event_name, 'count', q.event_count) order by q.event_count desc)
      from (
        select event_name, count(*) as event_count
        from public.product_events
        where occurred_at >= v_since
        group by event_name
        order by event_count desc
        limit 12
      ) q
    ), '[]'::jsonb),
    'top_routes', coalesce((
      select jsonb_agg(jsonb_build_object('route', q.route, 'views', q.route_count) order by q.route_count desc)
      from (
        select route, count(*) as route_count
        from public.product_events
        where occurred_at >= v_since
          and event_name = 'page_view'
          and route is not null
        group by route
        order by route_count desc
        limit 12
      ) q
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', q.day,
        'events', q.event_count,
        'sessions', q.session_count,
        'users', q.user_count
      ) order by q.day)
      from (
        select occurred_at::date as day,
               count(*) as event_count,
               count(distinct session_id) as session_count,
               count(distinct user_id) filter (where user_id is not null) as user_count
        from public.product_events
        where occurred_at >= v_since
        group by occurred_at::date
      ) q
    ), '[]'::jsonb)
  ) into v_result
  from public.product_events
  where occurred_at >= v_since;

  return coalesce(v_result, jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'total_events', 0,
    'page_views', 0,
    'unique_sessions', 0,
    'active_users', 0,
    'explorer_opens', 0,
    'voyage_opens', 0,
    'ai_opens', 0,
    'travel_match_opens', 0,
    'trips_created', 0,
    'trip_items_added', 0,
    'top_events', '[]'::jsonb,
    'top_routes', '[]'::jsonb,
    'daily', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.get_product_analytics_summary(integer) from public;
grant execute on function public.get_product_analytics_summary(integer) to authenticated, service_role;

comment on table public.product_events is 'Privacy-minimized first-party GlobeLink product analytics. No email, IP address, free-form user text or exact destination names are collected by the client tracker.';
