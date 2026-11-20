-- Measure destination detail views followed by a place added to the carnet in the same browser session.
create or replace function public.get_product_analytics_summary(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)));
  v_result jsonb;
  v_destination_carnet jsonb;
begin
  if (select auth.role()) is distinct from 'service_role'
     and not coalesce((select public.has_role(auth.uid(), 'admin')), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  -- The analytics session ID survives sign-in and onboarding in the same tab.
  -- A signed-in view only counts toward an add by the same account.
  with destination_views as (
    select session_id, user_id, min(occurred_at) as first_view_at
    from public.product_events
    where occurred_at >= v_since
      and source <> 'server'
      and event_name = 'page_view'
      and route = '/destinations/:slug'
    group by session_id, user_id
  )
  select jsonb_build_object(
    'viewed_sessions', count(distinct viewed.session_id),
    'converted_sessions', count(distinct viewed.session_id) filter (where exists (
      select 1
      from public.product_events added
      where added.session_id = viewed.session_id
        and added.occurred_at > viewed.first_view_at
        and added.event_name = 'trip_item_added'
        and added.source <> 'server'
        and added.user_id is not null
        and (viewed.user_id is null or viewed.user_id = added.user_id)
        and added.metadata->>'kind' in ('activity', 'hotel', 'restaurant', 'stop')
    ))
  ) into v_destination_carnet
  from destination_views viewed;

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
    'destination_carnet', v_destination_carnet,
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
    'destination_carnet', v_destination_carnet,
    'top_events', '[]'::jsonb,
    'top_routes', '[]'::jsonb,
    'daily', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.get_product_analytics_summary(integer) from public, anon;
grant execute on function public.get_product_analytics_summary(integer) to authenticated, service_role;
