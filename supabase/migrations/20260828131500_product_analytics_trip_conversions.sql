-- Capture trip creation as a server-side conversion so it remains reliable even if the browser closes immediately.
-- Server events are excluded from session counts to avoid inflating visit metrics.

alter table public.product_events
  drop constraint if exists product_events_source_valid;

alter table public.product_events
  add constraint product_events_source_valid
  check (source in ('web', 'mobile-web', 'pwa', 'server'));

create or replace function public.capture_trip_created_product_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.product_events (
    user_id,
    session_id,
    event_name,
    route,
    source,
    metadata
  ) values (
    new.user_id,
    'server:' || new.id::text,
    'trip_created',
    '/trips',
    'server',
    jsonb_build_object(
      'has_dates', new.starts_on is not null,
      'has_budget', new.budget is not null
    )
  );
  return new;
end;
$$;

revoke all on function public.capture_trip_created_product_event() from public;

drop trigger if exists product_analytics_trip_created on public.trips;
create trigger product_analytics_trip_created
after insert on public.trips
for each row
execute function public.capture_trip_created_product_event();

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
    'unique_sessions', count(distinct session_id) filter (where source <> 'server'),
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
               count(distinct session_id) filter (where source <> 'server') as session_count,
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
