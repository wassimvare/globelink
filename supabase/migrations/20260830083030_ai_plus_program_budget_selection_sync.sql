alter table public.trip_expenses
  add column if not exists details jsonb not null default '{}'::jsonb;

create unique index if not exists trip_expenses_one_ai_forecast_per_day
  on public.trip_expenses (trip_id, spent_on)
  where category = 'Prévision IA+';
