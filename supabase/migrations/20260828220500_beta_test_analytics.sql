-- GlobeLink beta analytics: separate beta testers from normal product traffic.
-- Beta membership is attached client-side after visiting /beta and is also inferred
-- from beta support tickets so older testers remain visible in the dashboard.

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
      'has_dates', 'has_budget', 'authenticated', 'device', 'beta_round'
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

create or replace function public.get_beta_analytics_summary(
  p_days integer default 30,
  p_beta_round text default 'private-1'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)));
  v_round text := left(trim(coalesce(nullif(p_beta_round, ''), 'private-1')), 40);
  v_total_events bigint := 0;
  v_page_views bigint := 0;
  v_sessions bigint := 0;
  v_testers bigint := 0;
  v_beta_entries bigint := 0;
  v_explorer bigint := 0;
  v_voyage bigint := 0;
  v_ai bigint := 0;
  v_match bigint := 0;
  v_trips bigint := 0;
  v_items bigint := 0;
  v_feedback bigint := 0;
  v_blocking bigint := 0;
  v_bugs bigint := 0;
  v_confusing bigint := 0;
  v_resolved bigint := 0;
  v_top_routes jsonb := '[]'::jsonb;
  v_feature_usage jsonb := '[]'::jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' and not public.has_role(auth.uid(), 'admin') then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  with beta_users as (
    select distinct t.user_id
    from public.support_tickets t
    where t.user_id is not null
      and lower(coalesce(t.context->>'beta', 'false')) = 'true'
      and coalesce(t.context->>'beta_round', v_round) = v_round
  ), beta_events as (
    select e.*
    from public.product_events e
    where e.occurred_at >= v_since
      and (
        e.metadata->>'beta_round' = v_round
        or (e.user_id is not null and e.user_id in (select user_id from beta_users))
      )
  )
  select
    count(*),
    count(*) filter (where event_name = 'page_view'),
    count(distinct session_id),
    count(distinct session_id) filter (where event_name = 'beta_joined'),
    count(*) filter (where event_name = 'explorer_opened'),
    count(*) filter (where event_name = 'voyage_opened'),
    count(*) filter (where event_name = 'ai_opened'),
    count(*) filter (where event_name = 'travel_match_opened'),
    count(*) filter (where event_name = 'trip_created'),
    count(*) filter (where event_name = 'trip_item_added')
  into
    v_total_events,
    v_page_views,
    v_sessions,
    v_beta_entries,
    v_explorer,
    v_voyage,
    v_ai,
    v_match,
    v_trips,
    v_items
  from beta_events;

  with beta_users_from_feedback as (
    select distinct t.user_id
    from public.support_tickets t
    where t.user_id is not null
      and lower(coalesce(t.context->>'beta', 'false')) = 'true'
      and coalesce(t.context->>'beta_round', v_round) = v_round
  ), beta_users_from_events as (
    select distinct e.user_id
    from public.product_events e
    where e.user_id is not null
      and e.occurred_at >= v_since
      and e.metadata->>'beta_round' = v_round
  )
  select count(*)
  into v_testers
  from (
    select user_id from beta_users_from_feedback
    union
    select user_id from beta_users_from_events
  ) q;

  select
    count(*),
    count(*) filter (where t.context->>'impact' = 'blocking'),
    count(*) filter (where t.context->>'feedback_kind' = 'bug'),
    count(*) filter (where t.context->>'feedback_kind' = 'confusing'),
    count(*) filter (where t.status in ('resolved', 'closed'))
  into v_feedback, v_blocking, v_bugs, v_confusing, v_resolved
  from public.support_tickets t
  where t.created_at >= v_since
    and lower(coalesce(t.context->>'beta', 'false')) = 'true'
    and coalesce(t.context->>'beta_round', v_round) = v_round;

  with beta_users as (
    select distinct t.user_id
    from public.support_tickets t
    where t.user_id is not null
      and lower(coalesce(t.context->>'beta', 'false')) = 'true'
      and coalesce(t.context->>'beta_round', v_round) = v_round
  ), beta_events as (
    select e.*
    from public.product_events e
    where e.occurred_at >= v_since
      and (
        e.metadata->>'beta_round' = v_round
        or (e.user_id is not null and e.user_id in (select user_id from beta_users))
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object('route', q.route, 'views', q.views) order by q.views desc), '[]'::jsonb)
  into v_top_routes
  from (
    select route, count(*) as views
    from beta_events
    where event_name = 'page_view' and route is not null
    group by route
    order by views desc
    limit 10
  ) q;

  with beta_users as (
    select distinct t.user_id
    from public.support_tickets t
    where t.user_id is not null
      and lower(coalesce(t.context->>'beta', 'false')) = 'true'
      and coalesce(t.context->>'beta_round', v_round) = v_round
  ), beta_events as (
    select e.*
    from public.product_events e
    where e.occurred_at >= v_since
      and (
        e.metadata->>'beta_round' = v_round
        or (e.user_id is not null and e.user_id in (select user_id from beta_users))
      )
  ), features(feature, event_name) as (
    values
      ('Explorer'::text, 'explorer_opened'::text),
      ('Voyage'::text, 'voyage_opened'::text),
      ('GlobeLink IA'::text, 'ai_opened'::text),
      ('Travel Match'::text, 'travel_match_opened'::text),
      ('Création voyage'::text, 'trip_created'::text),
      ('Ajout au carnet'::text, 'trip_item_added'::text)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'feature', f.feature,
    'event', f.event_name,
    'opens', coalesce(x.opens, 0),
    'sessions', coalesce(x.sessions, 0),
    'adoption', case when v_sessions > 0 then round((coalesce(x.sessions, 0)::numeric / v_sessions::numeric) * 100, 1) else 0 end
  ) order by array_position(array['Explorer','Voyage','GlobeLink IA','Travel Match','Création voyage','Ajout au carnet'], f.feature)), '[]'::jsonb)
  into v_feature_usage
  from features f
  left join (
    select event_name, count(*) as opens, count(distinct session_id) as sessions
    from beta_events
    group by event_name
  ) x on x.event_name = f.event_name;

  with beta_users as (
    select distinct t.user_id
    from public.support_tickets t
    where t.user_id is not null
      and lower(coalesce(t.context->>'beta', 'false')) = 'true'
      and coalesce(t.context->>'beta_round', v_round) = v_round
  ), beta_events as (
    select e.*
    from public.product_events e
    where e.occurred_at >= v_since
      and (
        e.metadata->>'beta_round' = v_round
        or (e.user_id is not null and e.user_id in (select user_id from beta_users))
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', q.day,
    'events', q.events,
    'sessions', q.sessions,
    'users', q.users,
    'feedback', q.feedback
  ) order by q.day), '[]'::jsonb)
  into v_daily
  from (
    select
      e.occurred_at::date as day,
      count(*) as events,
      count(distinct e.session_id) as sessions,
      count(distinct e.user_id) filter (where e.user_id is not null) as users,
      (
        select count(*)
        from public.support_tickets t
        where t.created_at::date = e.occurred_at::date
          and lower(coalesce(t.context->>'beta', 'false')) = 'true'
          and coalesce(t.context->>'beta_round', v_round) = v_round
      ) as feedback
    from beta_events e
    group by e.occurred_at::date
  ) q;

  v_result := jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'beta_round', v_round,
    'testers', v_testers,
    'sessions', v_sessions,
    'beta_entries', v_beta_entries,
    'page_views', v_page_views,
    'total_events', v_total_events,
    'feedback_total', v_feedback,
    'blocking_feedback', v_blocking,
    'bug_feedback', v_bugs,
    'confusing_feedback', v_confusing,
    'resolved_feedback', v_resolved,
    'explorer_opens', v_explorer,
    'voyage_opens', v_voyage,
    'ai_opens', v_ai,
    'travel_match_opens', v_match,
    'trips_created', v_trips,
    'trip_items_added', v_items,
    'top_routes', v_top_routes,
    'feature_usage', v_feature_usage,
    'daily', v_daily
  );

  return v_result;
end;
$$;

revoke all on function public.get_beta_analytics_summary(integer, text) from public;
grant execute on function public.get_beta_analytics_summary(integer, text) to authenticated, service_role;

comment on function public.get_beta_analytics_summary(integer, text) is
  'Admin-only aggregate analytics for GlobeLink beta cohorts. No email, IP address, free-form private content, or exact destination names are returned.';
