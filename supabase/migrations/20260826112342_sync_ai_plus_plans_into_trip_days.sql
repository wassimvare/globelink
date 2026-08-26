create or replace function public.globelink_sync_ai_plus_plan()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parts text[];
  v_latest text;
  v_content text;
  v_line text;
  v_match text[];
  v_current_num integer;
  v_current_headline text;
  v_current_body text := '';
  v_day_numbers integer[] := array[]::integer[];
  v_headlines text[] := array[]::text[];
  v_bodies text[] := array[]::text[];
  v_existing_start date;
  v_base_date date;
  v_day_date date;
  v_headline text;
  v_body text;
  v_entry_title text;
  v_entry_id uuid;
  i integer;
begin
  if new.notes is null
     or new.notes is not distinct from old.notes
     or position('## ✨ IA+ ·' in new.notes) = 0 then
    return new;
  end if;

  v_parts := regexp_split_to_array(new.notes, E'\n\n---\n## ✨ IA\\+ · ');
  if coalesce(array_length(v_parts, 1), 0) < 2 then
    return new;
  end if;

  v_latest := v_parts[array_length(v_parts, 1)];
  v_content := regexp_replace(v_latest, E'^[^\n]*\n_[^\n]*_\n\n?', '');

  if v_content !~* E'(^|\n)[[:space:]#*]*jour[[:space:]]+[0-9]{1,2}'
     and v_content !~* E'(^|\n)[[:space:]#*]*j[0-9]{1,2}([[:space:]:—–-]|$)' then
    return new;
  end if;

  foreach v_line in array string_to_array(replace(v_content, E'\r\n', E'\n'), E'\n') loop
    v_match := regexp_match(v_line, E'^[[:space:]#*]*jour[[:space:]]+([0-9]{1,2})(.*)$', 'i');
    if v_match is null then
      v_match := regexp_match(v_line, E'^[[:space:]#*]*j([0-9]{1,2})(.*)$', 'i');
    end if;

    if v_match is not null then
      if v_current_num is not null then
        v_day_numbers := array_append(v_day_numbers, v_current_num);
        v_headlines := array_append(v_headlines, coalesce(v_current_headline, ''));
        v_bodies := array_append(v_bodies, btrim(v_current_body));
      end if;

      v_current_num := v_match[1]::integer;
      v_current_headline := btrim(
        regexp_replace(
          coalesce(v_match[2], ''),
          E'^[[:space:]*:—–-]+|[[:space:]*]+$',
          '',
          'g'
        )
      );
      v_current_body := '';
    elsif v_current_num is not null then
      v_current_body := v_current_body
        || case when v_current_body = '' then '' else E'\n' end
        || v_line;
    end if;
  end loop;

  if v_current_num is not null then
    v_day_numbers := array_append(v_day_numbers, v_current_num);
    v_headlines := array_append(v_headlines, coalesce(v_current_headline, ''));
    v_bodies := array_append(v_bodies, btrim(v_current_body));
  end if;

  if coalesce(array_length(v_day_numbers, 1), 0) = 0 then
    return new;
  end if;

  select min(day_date)
    into v_existing_start
    from public.trip_days
   where trip_id = new.id
     and user_id = new.user_id;

  v_base_date := coalesce(new.starts_on, v_existing_start, current_date);

  for i in 1..array_length(v_day_numbers, 1) loop
    if v_day_numbers[i] < 1 or v_day_numbers[i] > 60 then
      continue;
    end if;

    v_day_date := v_base_date + (v_day_numbers[i] - 1);
    v_headline := nullif(btrim(v_headlines[i]), '');
    if v_headline is null then
      v_headline := 'Jour ' || v_day_numbers[i]::text;
    end if;
    v_body := nullif(btrim(v_bodies[i]), '');
    if v_body is null then
      v_body := v_headline;
    end if;

    insert into public.trip_days (
      trip_id,
      user_id,
      day_date,
      headline,
      notes,
      updated_at
    ) values (
      new.id,
      new.user_id,
      v_day_date,
      left(v_headline, 180),
      left(v_body, 30000),
      now()
    )
    on conflict (trip_id, day_date) do update
      set headline = case
            when public.trip_days.headline is null
              or btrim(public.trip_days.headline) = ''
              or public.trip_days.headline ~* '^jour[[:space:]]+[0-9]+$'
            then excluded.headline
            else public.trip_days.headline
          end,
          notes = case
            when public.trip_days.notes is null or btrim(public.trip_days.notes) = ''
              then excluded.notes
            when position(excluded.notes in public.trip_days.notes) > 0
              then public.trip_days.notes
            else left(public.trip_days.notes || E'\n\n---\nPlan IA+ enregistré\n' || excluded.notes, 30000)
          end,
          updated_at = now();

    v_entry_title := left(
      'IA+ · Jour ' || v_day_numbers[i]::text ||
      case
        when lower(v_headline) = lower('Jour ' || v_day_numbers[i]::text) then ''
        else ' · ' || v_headline
      end,
      180
    );

    select id
      into v_entry_id
      from public.trip_entries
     where trip_id = new.id
       and user_id = new.user_id
       and kind = 'note'
       and visited_on = v_day_date
       and title ~* ('^IA\\+ · Jour[[:space:]]+' || v_day_numbers[i]::text || '([[:space:]·—–:-]|$)')
     order by created_at desc
     limit 1;

    if v_entry_id is null then
      insert into public.trip_entries (
        trip_id,
        user_id,
        title,
        city,
        country,
        notes,
        visited_on,
        position,
        kind
      ) values (
        new.id,
        new.user_id,
        v_entry_title,
        new.city,
        new.country,
        left(v_body, 12000),
        v_day_date,
        -20 + i,
        'note'
      );
    else
      update public.trip_entries
         set title = v_entry_title,
             city = coalesce(city, new.city),
             country = coalesce(country, new.country),
             notes = left(v_body, 12000),
             position = -20 + i,
             updated_at = now()
       where id = v_entry_id;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.globelink_sync_ai_plus_plan() from public, anon, authenticated;

drop trigger if exists globelink_sync_ai_plus_plan_trigger on public.trips;
create trigger globelink_sync_ai_plus_plan_trigger
after update of notes on public.trips
for each row
when (old.notes is distinct from new.notes)
execute function public.globelink_sync_ai_plus_plan();

create or replace function public.globelink_suppress_redundant_ai_plus_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notes text;
  v_parts text[];
  v_latest text;
  v_content text;
begin
  if new.kind <> 'note'
     or new.title <> 'IA+ · Conseil enregistré depuis IA+' then
    return new;
  end if;

  select notes
    into v_notes
    from public.trips
   where id = new.trip_id
     and user_id = new.user_id;

  if v_notes is null or position('## ✨ IA+ ·' in v_notes) = 0 then
    return new;
  end if;

  v_parts := regexp_split_to_array(v_notes, E'\n\n---\n## ✨ IA\\+ · ');
  if coalesce(array_length(v_parts, 1), 0) < 2 then
    return new;
  end if;

  v_latest := v_parts[array_length(v_parts, 1)];
  v_content := regexp_replace(v_latest, E'^[^\n]*\n_[^\n]*_\n\n?', '');

  if v_content ~* E'(^|\n)[[:space:]#*]*jour[[:space:]]+[0-9]{1,2}'
     or v_content ~* E'(^|\n)[[:space:]#*]*j[0-9]{1,2}([[:space:]:—–-]|$)' then
    return null;
  end if;

  return new;
end;
$$;

revoke all on function public.globelink_suppress_redundant_ai_plus_entry() from public, anon, authenticated;

drop trigger if exists globelink_suppress_redundant_ai_plus_entry_trigger on public.trip_entries;
create trigger globelink_suppress_redundant_ai_plus_entry_trigger
before insert on public.trip_entries
for each row
execute function public.globelink_suppress_redundant_ai_plus_entry();