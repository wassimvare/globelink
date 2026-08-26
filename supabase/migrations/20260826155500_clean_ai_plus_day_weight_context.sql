create or replace function public.globelink_ai_plus_day_context(p_trip_id uuid, p_user_id uuid, p_day date)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select lower(concat_ws(' ',
    coalesce((
      select concat_ws(' ',
        d.headline,
        regexp_replace(coalesce(d.notes, ''), E'\n\n---\n\n##[[:space:]]+Budget.*$', '', 'is')
      )
      from public.trip_days d
      where d.trip_id = p_trip_id
        and d.user_id = p_user_id
        and d.day_date = p_day
      limit 1
    ), ''),
    coalesce((
      select string_agg(
        concat_ws(' ',
          e.title,
          regexp_replace(coalesce(e.notes, ''), E'\n\n---\n\n##[[:space:]]+Budget.*$', '', 'is')
        ),
        ' '
      )
      from public.trip_entries e
      where e.trip_id = p_trip_id
        and e.user_id = p_user_id
        and e.visited_on = p_day
    ), '')
  ));
$$;

revoke all on function public.globelink_ai_plus_day_context(uuid, uuid, date) from public, anon, authenticated;

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
  select id, user_id, starts_on, ends_on into v_trip
  from public.trips where id = p_trip_id;
  if not found then return 0; end if;

  select array_agg(d.day_date order by d.day_date) into v_dates
  from public.trip_days d
  where d.trip_id = v_trip.id
    and d.user_id = v_trip.user_id
    and (v_trip.starts_on is null or d.day_date >= v_trip.starts_on)
    and (v_trip.ends_on is null or d.day_date <= v_trip.ends_on);

  if coalesce(array_length(v_dates, 1), 0) < 2
     and v_trip.starts_on is not null and v_trip.ends_on is not null
     and v_trip.ends_on >= v_trip.starts_on
     and (v_trip.ends_on - v_trip.starts_on) < 60 then
    select array_agg(gs::date order by gs) into v_dates
    from generate_series(v_trip.starts_on::timestamp, v_trip.ends_on::timestamp, interval '1 day') gs;
  end if;

  v_date_count := coalesce(array_length(v_dates, 1), 0);
  if v_date_count < 2 then return 0; end if;

  for v_item in
    with grouped as materialized (
      select label, currency, sum(amount)::numeric amount
      from public.trip_expenses
      where trip_id = v_trip.id and user_id = v_trip.user_id
        and category = 'Prévision IA+'
        and label like 'IA+ · %'
        and label not like 'IA+ · Budget prévu · %'
      group by label, currency
    ) select * from grouped
  loop
    v_total_cents := round(v_item.amount * 100)::bigint;
    if v_total_cents <= 0 then continue; end if;

    v_scores := array[]::numeric[];
    v_total_score := 0;
    for v_i in 1..v_date_count loop
      v_day_text := coalesce(public.globelink_ai_plus_day_context(v_trip.id, v_trip.user_id, v_dates[v_i]), '');
      v_score := 1;

      if v_item.label ~* '(restauration|restaurant|repas|food)' then
        v_score := v_score
          + 6 * regexp_count(v_day_text, '(dîner|diner|restaurant|bistrot|bouchon|brunch)', 1, 'i')
          + 4 * regexp_count(v_day_text, '(déjeuner|dejeuner|repas|restauration|street[ -]?food)', 1, 'i')
          + 2 * regexp_count(v_day_text, '(petit[ -]?déjeuner|petit[ -]?dejeuner|café|cafe|boisson|terrasse|gourmand|glace|encas|pique[ -]?nique)', 1, 'i');
      elsif v_item.label ~* '(transport|trajet|déplacement|deplacement)' then
        v_score := v_score
          + 7 * regexp_count(v_day_text, '(avion|vol|taxi|uber|location de voiture|voiture de location)', 1, 'i')
          + 5 * regexp_count(v_day_text, '(train|tgv|ferry|bateau|transfert)', 1, 'i')
          + 3 * regexp_count(v_day_text, '(métro|metro|tram|bus|funiculaire|navette)', 1, 'i')
          + 2 * regexp_count(v_day_text, '(transport|trajet)', 1, 'i');
      elsif v_item.label ~* '(achat|shopping|souvenir|boutique|cadeau)' then
        v_score := v_score
          + 7 * regexp_count(v_day_text, '(shopping|achat|acheter|boutique|souvenir|cadeau)', 1, 'i')
          + 4 * regexp_count(v_day_text, '(marché|marche|centre commercial)', 1, 'i');
      else
        v_score := v_score
          + 5 * regexp_count(v_day_text, '(shopping|achat|acheter|boutique|souvenir|cadeau)', 1, 'i')
          + 4 * regexp_count(v_day_text, '(excursion|activité|activite|croisière|croisiere|spectacle|concert|cinéma|cinema|spa|quad|surf|plongée|plongee)', 1, 'i')
          + 2 * regexp_count(v_day_text, '(visite|musée|musee|parc|zoo|jardin|théâtre|theatre|monument|basilique|cathédrale|cathedrale|traboule|balade)', 1, 'i');
        if v_day_text ~* '(gratuit|accès libre|acces libre)' then v_score := greatest(1, v_score * 0.65); end if;
      end if;

      v_scores := array_append(v_scores, greatest(v_score, 1));
      v_total_score := v_total_score + greatest(v_score, 1);
    end loop;

    delete from public.trip_expenses
    where trip_id = v_trip.id and user_id = v_trip.user_id
      and category = 'Prévision IA+' and label = v_item.label and currency = v_item.currency;

    v_output_label := case when v_item.label ~* '^IA\+ · (Divers|Extras)$'
      then 'IA+ · Activités & achats' else v_item.label end;

    v_remaining_cents := v_total_cents;
    for v_i in 1..v_date_count loop
      if v_i = v_date_count then
        v_piece_cents := v_remaining_cents;
      else
        v_piece_cents := floor(v_total_cents * v_scores[v_i] / nullif(v_total_score, 0))::bigint;
        v_piece_cents := least(v_piece_cents, v_remaining_cents);
      end if;
      if v_piece_cents > 0 then
        insert into public.trip_expenses(trip_id,user_id,label,amount,currency,category,spent_on)
        values(v_trip.id,v_trip.user_id,v_output_label,v_piece_cents::numeric/100,v_item.currency,'Prévision IA+',v_dates[v_i]);
        v_inserted := v_inserted + 1;
        v_remaining_cents := v_remaining_cents - v_piece_cents;
      end if;
    end loop;
  end loop;
  return v_inserted;
end;
$$;

revoke all on function public.globelink_spread_ai_plus_expenses(uuid) from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select id from public.trips where notes like '%## ✨ IA+ ·%' loop
    perform public.globelink_apply_ai_plus_expenses(r.id);
    perform public.globelink_spread_ai_plus_expenses(r.id);
  end loop;
end;
$$;