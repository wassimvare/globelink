create or replace function public.globelink_apply_ai_plus_expenses(p_trip_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip record;
  v_parts text[];
  v_latest text;
  v_content text;
  v_section_match text[];
  v_impact text;
  v_budget text;
  v_line text;
  v_plain text;
  v_date_match text[];
  v_day_match text[];
  v_slash_match text[];
  v_amount_match text[];
  v_table_match text[];
  v_expense_date date;
  v_base_date date;
  v_day_num integer;
  v_amount numeric;
  v_headline text;
  v_label text;
  v_payload text;
  v_segment text;
  v_inserted integer := 0;
  v_day_forecasts integer := 0;
  v_allocation_count integer := 0;
  v_seen_dates date[] := array[]::date[];
begin
  select id, user_id, starts_on, ends_on, notes
    into v_trip
    from public.trips
   where id = p_trip_id;

  if not found or v_trip.notes is null or position('## ✨ IA+ ·' in v_trip.notes) = 0 then
    return 0;
  end if;

  v_parts := string_to_array(v_trip.notes, E'\n\n---\n## ✨ IA+ · ');
  if coalesce(array_length(v_parts, 1), 0) < 2 then
    return 0;
  end if;

  v_latest := v_parts[array_length(v_parts, 1)];
  v_content := regexp_replace(v_latest, E'^[^\n]*\n_[^\n]*_\n\n?', '');

  select min(day_date)
    into v_base_date
    from public.trip_days
   where trip_id = v_trip.id
     and user_id = v_trip.user_id;
  v_base_date := coalesce(v_trip.starts_on, v_base_date, current_date);

  -- IA+ forecasts are regenerated from the latest saved plan.
  -- Manual expenses are never touched.
  delete from public.trip_expenses
   where trip_id = v_trip.id
     and user_id = v_trip.user_id
     and category = 'Prévision IA+'
     and label like 'IA+ · %';

  v_section_match := regexp_match(
    v_content,
    E'##[[:space:]]+Impact sur ton carnet[[:space:]]*\n(.*?)(\n\n---\n\n##[[:space:]]+|$)',
    'is'
  );
  v_impact := coalesce(v_section_match[1], '');

  -- Prefer day-specific forecast budgets.
  foreach v_line in array string_to_array(replace(v_impact, E'\r\n', E'\n'), E'\n') loop
    v_plain := btrim(regexp_replace(v_line, '[*_`"]', '', 'g'));
    if v_plain = '' then continue; end if;

    if v_plain !~* '(budget[[:space:]]+prévisionnel|budget[[:space:]]+prévu|estimer|estimation|restant de la journée)'
       or v_plain ~* '(budget initial|dépenses enregistrées|reste disponible|solde|total estimé)' then
      continue;
    end if;

    v_expense_date := null;
    v_day_num := null;

    v_date_match := regexp_match(v_plain, '(20[0-9]{2}-[0-9]{2}-[0-9]{2})');
    if v_date_match is not null then
      begin v_expense_date := v_date_match[1]::date; exception when others then v_expense_date := null; end;
    end if;

    if v_expense_date is null then
      v_slash_match := regexp_match(v_plain, '([0-3]?[0-9])/([01]?[0-9])');
      if v_slash_match is not null then
        begin
          v_expense_date := make_date(extract(year from v_base_date)::integer, v_slash_match[2]::integer, v_slash_match[1]::integer);
        exception when others then
          v_expense_date := null;
        end;
      end if;
    end if;

    if v_expense_date is null then
      v_day_match := regexp_match(v_plain, '(^|[^[:alpha:]])jour[[:space:]]+([0-9]{1,2})([^0-9]|$)', 'i');
      if v_day_match is not null then
        v_day_num := v_day_match[2]::integer;
        if v_day_num between 1 and 60 then v_expense_date := v_base_date + (v_day_num - 1); end if;
      end if;
    end if;

    if v_expense_date is null then continue; end if;

    v_amount := null;
    for v_amount_match in select regexp_matches(v_plain, '([0-9]+([.,][0-9]{1,2})?)[[:space:]]*€', 'g') loop
      v_amount := replace(v_amount_match[1], ',', '.')::numeric;
    end loop;
    if v_amount is null or v_amount <= 0 or v_amount > 100000 then continue; end if;
    if v_expense_date = any(v_seen_dates) then continue; end if;
    v_seen_dates := array_append(v_seen_dates, v_expense_date);

    select nullif(btrim(headline), '') into v_headline
      from public.trip_days
     where trip_id = v_trip.id and user_id = v_trip.user_id and day_date = v_expense_date
     limit 1;

    v_label := 'IA+ · Budget prévu · ' || coalesce(v_headline, 'Journée ' || to_char(v_expense_date, 'DD/MM'));
    insert into public.trip_expenses (trip_id, user_id, label, amount, currency, category, spent_on)
    values (v_trip.id, v_trip.user_id, left(v_label, 180), v_amount, 'EUR', 'Prévision IA+', v_expense_date);
    v_inserted := v_inserted + 1;
    v_day_forecasts := v_day_forecasts + 1;
  end loop;

  -- If no per-day budgets exist, capture an explicit allocation such as
  -- "70 € Restauration / 10 € Transports / 20 € Divers".
  if v_day_forecasts = 0 and v_impact <> '' then
    foreach v_line in array string_to_array(replace(v_impact, E'\r\n', E'\n'), E'\n') loop
      v_plain := btrim(regexp_replace(v_line, '[*_`"]', '', 'g'));
      if v_plain !~* '(allocation prévisionnelle|enregistrer.*€)' or position('/' in v_plain) = 0 then continue; end if;

      if position(':' in v_plain) > 0 then
        v_payload := btrim(substring(v_plain from position(':' in v_plain) + 1));
      else
        v_payload := v_plain;
      end if;

      foreach v_segment in array string_to_array(v_payload, '/') loop
        v_segment := btrim(v_segment);
        v_amount_match := regexp_match(v_segment, '([0-9]+([.,][0-9]{1,2})?)[[:space:]]*€');
        if v_amount_match is null then continue; end if;
        v_amount := replace(v_amount_match[1], ',', '.')::numeric;
        if v_amount <= 0 or v_amount > 100000 then continue; end if;

        v_label := btrim(regexp_replace(v_segment, '[0-9]+([.,][0-9]{1,2})?[[:space:]]*€', '', 'g'));
        v_label := btrim(v_label, E' .,:;–—-');
        if v_label = '' then v_label := 'Budget prévu'; end if;

        insert into public.trip_expenses (trip_id, user_id, label, amount, currency, category, spent_on)
        values (v_trip.id, v_trip.user_id, left('IA+ · ' || v_label, 180), v_amount, 'EUR', 'Prévision IA+', v_base_date);
        v_inserted := v_inserted + 1;
        v_allocation_count := v_allocation_count + 1;
      end loop;
    end loop;
  end if;

  -- Final fallback: parse IA+ budget tables when no carnet allocation exists.
  if v_day_forecasts = 0 and v_allocation_count = 0 then
    v_section_match := regexp_match(
      v_content,
      E'##[[:space:]]+Budget[[:space:]]*\n(.*?)(\n\n---\n\n##[[:space:]]+|$)',
      'is'
    );
    v_budget := coalesce(v_section_match[1], '');

    foreach v_line in array string_to_array(replace(v_budget, E'\r\n', E'\n'), E'\n') loop
      v_plain := btrim(regexp_replace(v_line, '[*_`"]', '', 'g'));
      if position('|' in v_plain) = 0 or position('€' in v_plain) = 0 then continue; end if;
      if v_plain ~* '(total|budget initial|dépenses enregistrées|reste|solde)' then continue; end if;

      v_table_match := regexp_match(v_plain, '^\|[[:space:]]*([^|]+?)[[:space:]]*\|[[:space:]]*([^|]*€[^|]*)\|');
      if v_table_match is null then continue; end if;
      v_label := btrim(v_table_match[1], E' .,:;–—-');
      if v_label = '' or v_label ~* '^:?-+:?$' then continue; end if;

      v_amount := null;
      for v_amount_match in select regexp_matches(v_table_match[2], '([0-9]+([.,][0-9]{1,2})?)[[:space:]]*€', 'g') loop
        v_amount := replace(v_amount_match[1], ',', '.')::numeric;
      end loop;
      if v_amount is null or v_amount <= 0 or v_amount > 100000 then continue; end if;

      insert into public.trip_expenses (trip_id, user_id, label, amount, currency, category, spent_on)
      values (v_trip.id, v_trip.user_id, left('IA+ · ' || v_label, 180), v_amount, 'EUR', 'Prévision IA+', v_base_date);
      v_inserted := v_inserted + 1;
    end loop;
  end if;

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
  return new;
end;
$$;

drop trigger if exists zz_globelink_sync_ai_plus_expenses_trigger on public.trips;
create trigger zz_globelink_sync_ai_plus_expenses_trigger
after update of notes on public.trips
for each row
when (old.notes is distinct from new.notes)
execute function public.globelink_sync_ai_plus_expenses_trigger_fn();

revoke all on function public.globelink_apply_ai_plus_expenses(uuid) from public, anon, authenticated;
revoke all on function public.globelink_sync_ai_plus_expenses_trigger_fn() from public, anon, authenticated;

-- Backfill IA+ plans saved before this behavior existed.
do $$
declare r record;
begin
  for r in select id from public.trips where notes like '%## ✨ IA+ ·%' loop
    perform public.globelink_apply_ai_plus_expenses(r.id);
  end loop;
end;
$$;