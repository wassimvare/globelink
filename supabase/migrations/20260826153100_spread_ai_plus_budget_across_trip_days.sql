create or replace function public.globelink_spread_ai_plus_expenses(p_trip_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip record;
  v_dates date[];
  v_date_count integer;
  v_item record;
  v_total_cents bigint;
  v_base_cents bigint;
  v_remainder bigint;
  v_piece_cents bigint;
  v_i integer;
  v_inserted integer := 0;
begin
  select id, user_id, starts_on, ends_on
    into v_trip
    from public.trips
   where id = p_trip_id;

  if not found then
    return 0;
  end if;

  -- Prefer the actual journal days, while keeping them inside the trip dates when available.
  select array_agg(d.day_date order by d.day_date)
    into v_dates
    from public.trip_days d
   where d.trip_id = v_trip.id
     and d.user_id = v_trip.user_id
     and (v_trip.starts_on is null or d.day_date >= v_trip.starts_on)
     and (v_trip.ends_on is null or d.day_date <= v_trip.ends_on);

  -- If the journal is incomplete, use the complete trip date range (maximum 60 days).
  if coalesce(array_length(v_dates, 1), 0) < 2
     and v_trip.starts_on is not null
     and v_trip.ends_on is not null
     and v_trip.ends_on >= v_trip.starts_on
     and (v_trip.ends_on - v_trip.starts_on) < 60 then
    select array_agg(gs::date order by gs)
      into v_dates
      from generate_series(
        v_trip.starts_on::timestamp,
        v_trip.ends_on::timestamp,
        interval '1 day'
      ) as gs;
  end if;

  v_date_count := coalesce(array_length(v_dates, 1), 0);
  if v_date_count < 2 then
    return 0;
  end if;

  -- Day-specific IA+ forecasts already carry their own date and must stay untouched.
  -- Global IA+ allocations (restaurant / transport / extras, etc.) are rebuilt
  -- evenly over every trip day. Grouping first makes this function idempotent.
  for v_item in
    with grouped as materialized (
      select label, currency, sum(amount)::numeric as amount
        from public.trip_expenses
       where trip_id = v_trip.id
         and user_id = v_trip.user_id
         and category = 'Prévision IA+'
         and label like 'IA+ · %'
         and label not like 'IA+ · Budget prévu · %'
       group by label, currency
    )
    select * from grouped
  loop
    delete from public.trip_expenses
     where trip_id = v_trip.id
       and user_id = v_trip.user_id
       and category = 'Prévision IA+'
       and label = v_item.label
       and currency = v_item.currency;

    v_total_cents := round(v_item.amount * 100)::bigint;
    if v_total_cents <= 0 then
      continue;
    end if;

    v_base_cents := v_total_cents / v_date_count;
    v_remainder := v_total_cents % v_date_count;

    for v_i in 1..v_date_count loop
      v_piece_cents := v_base_cents + case when v_i <= v_remainder then 1 else 0 end;
      if v_piece_cents <= 0 then
        continue;
      end if;

      insert into public.trip_expenses (
        trip_id,
        user_id,
        label,
        amount,
        currency,
        category,
        spent_on
      )
      values (
        v_trip.id,
        v_trip.user_id,
        v_item.label,
        v_piece_cents::numeric / 100,
        v_item.currency,
        'Prévision IA+',
        v_dates[v_i]
      );
      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  return v_inserted;
end;
$$;

create or replace function public.globelink_sync_ai_plus_expenses_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.globelink_apply_ai_plus_expenses(new.id);
  perform public.globelink_spread_ai_plus_expenses(new.id);
  return new;
end;
$$;

revoke all on function public.globelink_spread_ai_plus_expenses(uuid) from public, anon, authenticated;
revoke all on function public.globelink_sync_ai_plus_expenses_trigger_fn() from public, anon, authenticated;

-- Backfill previously saved IA+ plans so existing trips are corrected immediately.
do $$
declare
  r record;
begin
  for r in
    select id
      from public.trips
     where notes like '%## ✨ IA+ ·%'
  loop
    perform public.globelink_apply_ai_plus_expenses(r.id);
    perform public.globelink_spread_ai_plus_expenses(r.id);
  end loop;
end;
$$;
