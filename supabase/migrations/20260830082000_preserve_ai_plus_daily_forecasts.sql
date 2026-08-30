create table if not exists public.ai_plus_forecast_archive (
  trip_id uuid not null,
  user_id uuid not null,
  spent_on date not null,
  label text not null,
  amount numeric(12,2) not null,
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id, spent_on)
);

alter table public.ai_plus_forecast_archive enable row level security;
revoke all on table public.ai_plus_forecast_archive from anon, authenticated;

insert into public.ai_plus_forecast_archive (trip_id, user_id, spent_on, label, amount, updated_at)
select e.trip_id, e.user_id, e.spent_on, e.label, e.amount, now()
from public.trip_expenses e
where e.category = 'Prévision IA+'
  and e.label like 'IA+ · Budget prévu%'
  and e.spent_on is not null
on conflict (trip_id, user_id, spent_on) do update
set label = excluded.label,
    amount = excluded.amount,
    updated_at = excluded.updated_at;

create or replace function public.globelink_archive_ai_plus_forecast_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.category = 'Prévision IA+'
     and old.label like 'IA+ · Budget prévu%'
     and old.spent_on is not null then
    insert into public.ai_plus_forecast_archive (trip_id, user_id, spent_on, label, amount, updated_at)
    values (old.trip_id, old.user_id, old.spent_on, old.label, old.amount, now())
    on conflict (trip_id, user_id, spent_on) do update
    set label = excluded.label,
        amount = excluded.amount,
        updated_at = excluded.updated_at;
  end if;
  return old;
end;
$$;

drop trigger if exists globelink_archive_ai_plus_forecast_before_delete_trigger on public.trip_expenses;
create trigger globelink_archive_ai_plus_forecast_before_delete_trigger
before delete on public.trip_expenses
for each row
execute function public.globelink_archive_ai_plus_forecast_before_delete();

create or replace function public.globelink_restore_missing_ai_plus_forecasts_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  insert into public.ai_plus_forecast_archive (trip_id, user_id, spent_on, label, amount, updated_at)
  select n.trip_id, n.user_id, n.spent_on, n.label, n.amount, now()
  from new_ai_plus_forecasts n
  where n.category = 'Prévision IA+'
    and n.label like 'IA+ · Budget prévu%'
    and n.spent_on is not null
  on conflict (trip_id, user_id, spent_on) do update
  set label = excluded.label,
      amount = excluded.amount,
      updated_at = excluded.updated_at;

  insert into public.trip_expenses (trip_id, user_id, label, amount, category, spent_on)
  select a.trip_id,
         a.user_id,
         a.label,
         a.amount,
         'Prévision IA+',
         a.spent_on
  from public.ai_plus_forecast_archive a
  join (
    select distinct n.trip_id, n.user_id
    from new_ai_plus_forecasts n
    where n.category = 'Prévision IA+'
      and n.label like 'IA+ · Budget prévu%'
  ) touched
    on touched.trip_id = a.trip_id
   and touched.user_id = a.user_id
  join public.trips t
    on t.id = a.trip_id
   and t.user_id = a.user_id
  where a.spent_on >= coalesce(t.starts_on, a.spent_on)
    and a.spent_on <= coalesce(t.ends_on, a.spent_on)
    and not exists (
      select 1
      from public.trip_expenses e
      where e.trip_id = a.trip_id
        and e.user_id = a.user_id
        and e.category = 'Prévision IA+'
        and e.label like 'IA+ · Budget prévu%'
        and e.spent_on = a.spent_on
    );

  return null;
end;
$$;

drop trigger if exists globelink_restore_missing_ai_plus_forecasts_after_insert_trigger on public.trip_expenses;
create trigger globelink_restore_missing_ai_plus_forecasts_after_insert_trigger
after insert on public.trip_expenses
referencing new table as new_ai_plus_forecasts
for each statement
execute function public.globelink_restore_missing_ai_plus_forecasts_after_insert();
