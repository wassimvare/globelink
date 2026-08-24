create or replace function public.reserve_free_ai_usage(p_feature text, p_mode text, p_query_chars integer)
returns integer
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  current_user_id uuid := (select auth.uid());
  daily_limit integer;
  used integer;
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  daily_limit := case p_feature
    when 'ai_trip' then 10
    when 'phase3_intelligence' then 10
    when 'chat' then 40
    else null
  end;

  if daily_limit is null then
    raise exception 'INVALID_AI_FEATURE' using errcode = '22023';
  end if;

  if p_query_chars is null or p_query_chars < 0
     or (p_feature = 'ai_trip' and p_query_chars > 1000)
     or (p_feature = 'phase3_intelligence' and p_query_chars > 1200)
     or (p_feature = 'chat' and p_query_chars > 28000)
     or char_length(coalesce(p_mode, '')) > 40 then
    raise exception 'INVALID_AI_METERING' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || ':' || p_feature || ':' || day_start::text, 0)
  );

  select count(*)::integer into used
  from public.ai_usage
  where user_id = current_user_id
    and feature = p_feature
    and created_at >= day_start;

  if used >= daily_limit then
    raise exception 'AI_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.ai_usage (user_id, feature, mode, query_chars, source_count)
  values (current_user_id, p_feature, nullif(p_mode, ''), p_query_chars, 0);

  return daily_limit - used - 1;
end;
$$;
