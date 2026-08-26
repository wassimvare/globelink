-- Keep IA+ daily forecasts attached to the day they describe and make future saves
-- run the complete allocation pipeline.

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

  foreach v_line in array string_to_array(replace(v_impact, E'\r\n', E'\n'), E'\n') loop
    v_plain := btrim(regexp_replace(v_line, '[*_`"]', '', 'g'));
    if v_plain = '' then continue; end if;

    if v_plain !~* '(budget[[:space:]]+prévisionnel|budget[[:space:]]+prévu|estimer|estimation|restant de la journée|dépense[[:space:]]+cible|depense[[:space:]]+cible|objectif[[:space:]]+journalier)'
       or v_plain ~* '(budget initial|dépenses enregistrées|dépenses déjà enregistrées|reste disponible|solde|total estimé)' then
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
    if v_trip.starts_on is not null and v_expense_date < v_trip.starts_on then continue; end if;
    if v_trip.ends_on is not null and v_expense_date > v_trip.ends_on then continue; end if;

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

revoke all on function public.globelink_apply_ai_plus_expenses(uuid) from public, anon, authenticated;

create or replace function public.globelink_relocate_ai_plus_daily_forecasts(p_trip_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip record;
  v_row record;
  v_base_date date;
  v_target date;
  v_date_match text[];
  v_day_match text[];
  v_day_num integer;
  v_changed integer := 0;
begin
  select id, user_id, starts_on, ends_on into v_trip
  from public.trips where id = p_trip_id;
  if not found then return 0; end if;

  select min(day_date) into v_base_date
  from public.trip_days
  where trip_id = v_trip.id and user_id = v_trip.user_id;
  v_base_date := coalesce(v_trip.starts_on, v_base_date, current_date);

  for v_row in
    select id, label, spent_on
    from public.trip_expenses
    where trip_id = v_trip.id
      and user_id = v_trip.user_id
      and category = 'Prévision IA+'
      and label like 'IA+ · %'
  loop
    v_target := null;
    v_date_match := regexp_match(v_row.label, '(20[0-9]{2}-[0-9]{2}-[0-9]{2})');
    if v_date_match is not null then
      begin v_target := v_date_match[1]::date; exception when others then v_target := null; end;
    end if;

    if v_target is null then
      v_day_match := regexp_match(v_row.label, '(^|[^[:alpha:]])jour(?:née)?[[:space:]]+([0-9]{1,2})([^0-9]|$)', 'i');
      if v_day_match is not null then
        v_day_num := v_day_match[2]::integer;
        if v_day_num between 1 and 60 then v_target := v_base_date + (v_day_num - 1); end if;
      end if;
    end if;

    if v_target is null then continue; end if;
    if v_trip.starts_on is not null and v_target < v_trip.starts_on then continue; end if;
    if v_trip.ends_on is not null and v_target > v_trip.ends_on then continue; end if;

    if v_row.spent_on is distinct from v_target then
      update public.trip_expenses set spent_on = v_target where id = v_row.id;
      v_changed := v_changed + 1;
    end if;
  end loop;
  return v_changed;
end;
$$;

revoke all on function public.globelink_relocate_ai_plus_daily_forecasts(uuid) from public, anon, authenticated;

create or replace function public.globelink_spread_ai_plus_expenses(p_trip_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip record;
  v_dates date[];
  v_scores numeric[];
  v_date_count integer;
  v_item record;
  v_total_cents bigint;
  v_remaining_cents bigint;
  v_piece_cents bigint;
  v_i integer;
  v_day_text text;
  v_score numeric;
  v_total_score numeric;
  v_output_label text;
  v_inserted integer := 0;
begin
  select id, user_id, starts_on, ends_on into v_trip from public.trips where id = p_trip_id;
  if not found then return 0; end if;

  select array_agg(d.day_date order by d.day_date) into v_dates
  from public.trip_days d
  where d.trip_id = v_trip.id and d.user_id = v_trip.user_id
    and (v_trip.starts_on is null or d.day_date >= v_trip.starts_on)
    and (v_trip.ends_on is null or d.day_date <= v_trip.ends_on);

  if coalesce(array_length(v_dates,1),0) < 2
     and v_trip.starts_on is not null and v_trip.ends_on is not null
     and v_trip.ends_on >= v_trip.starts_on and (v_trip.ends_on-v_trip.starts_on) < 60 then
    select array_agg(gs::date order by gs) into v_dates
    from generate_series(v_trip.starts_on::timestamp,v_trip.ends_on::timestamp,interval '1 day') gs;
  end if;

  v_date_count := coalesce(array_length(v_dates,1),0);
  if v_date_count < 2 then return 0; end if;

  for v_item in
    with grouped as materialized (
      select label,currency,sum(amount)::numeric amount
      from public.trip_expenses
      where trip_id=v_trip.id and user_id=v_trip.user_id
        and category='Prévision IA+' and label like 'IA+ · %'
        and label not like 'IA+ · Budget prévu · %'
        and label !~* '^IA\+[[:space:]]*·[[:space:]]*Jour(?:née)?[[:space:]]+[0-9]+'
      group by label,currency
    ) select * from grouped
  loop
    v_total_cents := round(v_item.amount*100)::bigint;
    if v_total_cents <= 0 then continue; end if;
    v_scores := array[]::numeric[];
    v_total_score := 0;

    for v_i in 1..v_date_count loop
      v_day_text := coalesce(public.globelink_ai_plus_day_context(v_trip.id,v_trip.user_id,v_dates[v_i]),'');
      v_score := 1;
      if v_item.label ~* '(restauration|restaurant|repas|food)' then
        v_score := v_score
          + 6*regexp_count(v_day_text,'(dîner|diner|restaurant|bistrot|bouchon|brunch)',1,'i')
          + 4*regexp_count(v_day_text,'(déjeuner|dejeuner|repas|restauration|street[ -]?food)',1,'i')
          + 2*regexp_count(v_day_text,'(petit[ -]?déjeuner|petit[ -]?dejeuner|café|cafe|boisson|terrasse|gourmand|glace|encas|pique[ -]?nique)',1,'i');
      elsif v_item.label ~* '(transport|trajet|déplacement|deplacement)' then
        v_score := v_score
          + 7*regexp_count(v_day_text,'(avion|vol|taxi|uber|location de voiture|voiture de location)',1,'i')
          + 5*regexp_count(v_day_text,'(train|tgv|ferry|bateau|transfert)',1,'i')
          + 3*regexp_count(v_day_text,'(métro|metro|tram|bus|funiculaire|navette)',1,'i')
          + 2*regexp_count(v_day_text,'(transport|trajet)',1,'i');
      elsif v_item.label ~* '(achat|shopping|souvenir|boutique|cadeau)' then
        v_score := v_score
          + 7*regexp_count(v_day_text,'(shopping|achat|acheter|boutique|souvenir|cadeau)',1,'i')
          + 4*regexp_count(v_day_text,'(marché|marche|centre commercial)',1,'i');
      else
        v_score := v_score
          + 5*regexp_count(v_day_text,'(shopping|achat|acheter|boutique|souvenir|cadeau)',1,'i')
          + 4*regexp_count(v_day_text,'(excursion|activité|activite|croisière|croisiere|spectacle|concert|cinéma|cinema|spa|quad|surf|plongée|plongee)',1,'i')
          + 2*regexp_count(v_day_text,'(visite|musée|musee|parc|zoo|jardin|théâtre|theatre|monument|basilique|cathédrale|cathedrale|traboule|balade)',1,'i');
        if v_day_text ~* '(gratuit|accès libre|acces libre)' then v_score := greatest(1,v_score*0.65); end if;
      end if;
      v_scores := array_append(v_scores,greatest(v_score,1));
      v_total_score := v_total_score+greatest(v_score,1);
    end loop;

    delete from public.trip_expenses
    where trip_id=v_trip.id and user_id=v_trip.user_id and category='Prévision IA+'
      and label=v_item.label and currency=v_item.currency;

    v_output_label := case when v_item.label ~* '^IA\+ · (Divers|Extras)$'
      then 'IA+ · Activités & achats' else v_item.label end;
    v_remaining_cents := v_total_cents;

    for v_i in 1..v_date_count loop
      if v_i=v_date_count then
        v_piece_cents := v_remaining_cents;
      else
        v_piece_cents := least(public.globelink_ai_plus_weighted_piece(v_total_cents,v_scores[v_i],v_total_score),v_remaining_cents);
      end if;
      if v_piece_cents>0 then
        insert into public.trip_expenses(trip_id,user_id,label,amount,currency,category,spent_on)
        values(v_trip.id,v_trip.user_id,v_output_label,v_piece_cents::numeric/100,v_item.currency,'Prévision IA+',v_dates[v_i]);
        v_inserted:=v_inserted+1;
        v_remaining_cents:=v_remaining_cents-v_piece_cents;
      end if;
    end loop;
  end loop;
  return v_inserted;
end;
$$;

revoke all on function public.globelink_spread_ai_plus_expenses(uuid) from public, anon, authenticated;

create or replace function public.globelink_sync_ai_plus_expenses_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.globelink_apply_ai_plus_expenses(new.id);
  perform public.globelink_relocate_ai_plus_daily_forecasts(new.id);
  perform public.globelink_spread_ai_plus_expenses(new.id);
  return new;
end;
$$;

revoke all on function public.globelink_sync_ai_plus_expenses_trigger_fn() from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select id from public.trips where notes like '%## ✨ IA+ ·%' loop
    perform public.globelink_apply_ai_plus_expenses(r.id);
    perform public.globelink_relocate_ai_plus_daily_forecasts(r.id);
    perform public.globelink_spread_ai_plus_expenses(r.id);
  end loop;
end;
$$;
